import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import async_session_factory
from models.file_record import FileRecord
from models.research import ResearchEvent, ResearchJob, ResearchSource
from schemas.knowledge import ChunkCitation
from schemas.research import (
    ResearchCitation,
    ResearchDepth,
    ResearchJobCreate,
    ResearchPlan,
    ResearchReport,
    ResearchStep,
)
from services.file_service import FileService
from services.knowledge_service import KnowledgeService
from services.research.search_providers import get_search_provider
from services.research.synthesizer import ResearchSynthesizer
from services.research.url_utils import canonicalize_url, extract_publisher
from services.research.web_collector import WebCollector

logger = logging.getLogger("research_job_service")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ResearchJobService:
    """Manages the lifecycle, background execution, and provenance of web research jobs."""

    @staticmethod
    async def create_job(
        db: AsyncSession,
        owner_id: str,
        payload: ResearchJobCreate,
        auto_start: bool = True,
    ) -> ResearchJob:
        # Validate attached file ownership if any
        if payload.file_ids:
            for fid in payload.file_ids:
                rec = await FileService.get_file(db, owner_id, fid)
                if not rec:
                    raise ValueError(f"Attached document '{fid}' does not exist or access is unauthorized.")

        # Determine if approval is requested
        req_approval = payload.requires_approval
        if req_approval is None:
            # Default to requiring approval only for deep research
            req_approval = payload.depth == "deep"

        job_id = str(uuid.uuid4())
        initial_status = "planning"

        job = ResearchJob(
            id=job_id,
            owner_id=owner_id,
            question=payload.question.strip(),
            status=initial_status,
            depth=payload.depth,
            allowed_domains=payload.allowed_domains or [],
            file_ids=payload.file_ids or [],
            max_sources=payload.max_sources,
            requires_approval=req_approval,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        db.add(job)

        init_event = ResearchEvent(
            id=str(uuid.uuid4()),
            job_id=job_id,
            event_type="status_changed",
            message=f"Research job created in {payload.depth} mode.",
            created_at=utc_now(),
        )
        db.add(init_event)
        await db.commit()

        # Generate research plan
        plan = ResearchJobService._generate_plan(
            question=job.question,
            depth=job.depth,
            allowed_domains=job.allowed_domains,
            file_ids=job.file_ids,
            max_sources=job.max_sources,
            requires_approval=req_approval,
        )

        job.plan = plan.model_dump()
        plan_event = ResearchEvent(
            id=str(uuid.uuid4()),
            job_id=job_id,
            event_type="plan_created",
            message=f"Generated research plan with {len(plan.steps)} steps.",
            payload=plan.model_dump(),
            created_at=utc_now(),
        )
        db.add(plan_event)

        if req_approval:
            job.status = "awaiting_approval"
            approval_event = ResearchEvent(
                id=str(uuid.uuid4()),
                job_id=job_id,
                event_type="status_changed",
                message="Research plan generated. Awaiting user approval to commence execution.",
                created_at=utc_now(),
            )
            db.add(approval_event)
            await db.commit()
            await db.refresh(job)
        else:
            job.status = "running"
            run_event = ResearchEvent(
                id=str(uuid.uuid4()),
                job_id=job_id,
                event_type="status_changed",
                message="Research job running.",
                created_at=utc_now(),
            )
            db.add(run_event)
            await db.commit()
            await db.refresh(job)
            # Spawn execution in background task if auto_start is True
            if auto_start:
                asyncio.create_task(ResearchJobService._execute_job(job_id))

        return job

    @staticmethod
    def _generate_plan(
        question: str,
        depth: str,
        allowed_domains: Optional[List[str]],
        file_ids: Optional[List[str]],
        max_sources: int,
        requires_approval: bool,
    ) -> ResearchPlan:
        steps = [
            ResearchStep(
                step_number=1,
                action="search",
                query_or_target=question,
                rationale="Discover primary web sources and authoritative documentation.",
            ),
            ResearchStep(
                step_number=2,
                action="browse",
                query_or_target="Discovered web sources",
                rationale=f"Crawl and extract verified evidence up to {max_sources} sources.",
            ),
        ]

        if file_ids:
            steps.append(
                ResearchStep(
                    step_number=3,
                    action="compare_documents",
                    query_or_target=f"{len(file_ids)} attached user documents",
                    rationale="Correlate web findings with internal document context.",
                )
            )

        steps.append(
            ResearchStep(
                step_number=len(steps) + 1,
                action="synthesize",
                query_or_target="Report synthesis",
                rationale="Generate grounded research report with traceable citations.",
            )
        )

        domain_info = f" limited to {', '.join(allowed_domains)}" if allowed_domains else ""
        rationale = f"Execute a {depth} research investigation{domain_info} prioritizing source verification."

        return ResearchPlan(
            rationale=rationale,
            steps=steps,
            target_domains=allowed_domains or [],
            estimated_sources=max_sources,
            requires_approval=requires_approval,
        )

    @staticmethod
    async def approve_job(db: AsyncSession, owner_id: str, job_id: str) -> ResearchJob:
        job = await ResearchJobService.get_job(db, owner_id, job_id)
        if not job:
            raise KeyError("Research job not found.")

        if job.status != "awaiting_approval":
            raise ValueError(f"Job is in '{job.status}' state; cannot approve.")

        job.status = "running"
        job.updated_at = utc_now()
        event = ResearchEvent(
            id=str(uuid.uuid4()),
            job_id=job.id,
            event_type="status_changed",
            message="Research plan approved by user. Starting background execution.",
            created_at=utc_now(),
        )
        db.add(event)
        await db.commit()
        await db.refresh(job)

        asyncio.create_task(ResearchJobService._execute_job(job.id))
        return job

    @staticmethod
    async def cancel_job(
        db: AsyncSession,
        owner_id: str,
        job_id: str,
        reason: str = "Cancelled by user",
    ) -> ResearchJob:
        job = await ResearchJobService.get_job(db, owner_id, job_id)
        if not job:
            raise KeyError("Research job not found.")

        if job.status in ("completed", "failed", "cancelled"):
            raise ValueError(f"Job is already '{job.status}'.")

        job.status = "cancelled"
        job.cancellation_reason = reason
        job.updated_at = utc_now()
        event = ResearchEvent(
            id=str(uuid.uuid4()),
            job_id=job.id,
            event_type="cancelled",
            message=f"Research job cancelled: {reason}",
            created_at=utc_now(),
        )
        db.add(event)
        await db.commit()
        await db.refresh(job)
        return job

    @staticmethod
    async def get_job(db: AsyncSession, owner_id: str, job_id: str) -> Optional[ResearchJob]:
        stmt = (
            select(ResearchJob)
            .where(ResearchJob.id == job_id, ResearchJob.owner_id == owner_id)
        )
        return (await db.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def get_job_detail(
        db: AsyncSession, owner_id: str, job_id: str
    ) -> Optional[Tuple[ResearchJob, List[ResearchSource], List[ResearchEvent]]]:
        job = await ResearchJobService.get_job(db, owner_id, job_id)
        if not job:
            return None

        src_stmt = select(ResearchSource).where(ResearchSource.job_id == job_id).order_by(ResearchSource.created_at.asc())
        sources = list((await db.execute(src_stmt)).scalars().all())

        evt_stmt = select(ResearchEvent).where(ResearchEvent.job_id == job_id).order_by(ResearchEvent.created_at.asc())
        events = list((await db.execute(evt_stmt)).scalars().all())

        return job, sources, events

    @staticmethod
    async def list_jobs(
        db: AsyncSession,
        owner_id: str,
        status: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Tuple[List[ResearchJob], int]:
        stmt = select(ResearchJob).where(ResearchJob.owner_id == owner_id)
        if status:
            stmt = stmt.where(ResearchJob.status == status)

        count_stmt = select(func.count(ResearchJob.id)).where(ResearchJob.owner_id == owner_id)
        if status:
            count_stmt = count_stmt.where(ResearchJob.status == status)

        total = (await db.execute(count_stmt)).scalar_one() or 0
        items = list(
            (
                await db.execute(
                    stmt.order_by(ResearchJob.created_at.desc()).limit(limit).offset(offset)
                )
            ).scalars().all()
        )
        return items, total

    @staticmethod
    async def list_sources(db: AsyncSession, owner_id: str, job_id: str) -> List[ResearchSource]:
        job = await ResearchJobService.get_job(db, owner_id, job_id)
        if not job:
            raise KeyError("Research job not found.")

        stmt = select(ResearchSource).where(ResearchSource.job_id == job_id).order_by(ResearchSource.created_at.asc())
        return list((await db.execute(stmt)).scalars().all())

    @staticmethod
    async def get_source(
        db: AsyncSession, owner_id: str, job_id: str, source_id: str
    ) -> Optional[ResearchSource]:
        job = await ResearchJobService.get_job(db, owner_id, job_id)
        if not job:
            return None

        stmt = select(ResearchSource).where(
            ResearchSource.id == source_id, ResearchSource.job_id == job_id
        )
        return (await db.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def export_report_markdown(db: AsyncSession, owner_id: str, job_id: str) -> str:
        job = await ResearchJobService.get_job(db, owner_id, job_id)
        if not job:
            raise KeyError("Research job not found.")

        if not job.final_report:
            return f"# Research Report: {job.question}\n\n*Status: {job.status}. Report has not been generated.*"

        r = job.final_report
        lines = [
            f"# {r.get('title', 'Research Report')}",
            f"\n**Objective:** {job.question}",
            f"**Generated:** {job.completed_at or job.updated_at} UTC",
            "\n## Executive Summary\n",
            r.get("executive_summary", ""),
            "\n## Key Findings\n",
        ]

        for finding in r.get("key_findings", []):
            lines.append(f"* {finding}")

        lines.extend([
            "\n## Evidence & Analysis\n",
            r.get("evidence_and_analysis", ""),
        ])

        conflicts = r.get("conflicting_claims", [])
        if conflicts:
            lines.append("\n## Conflicting Claims\n")
            for c in conflicts:
                lines.append(f"* {c}")

        limitations = r.get("limitations_and_unresolved", [])
        if limitations:
            lines.append("\n## Limitations & Unresolved Questions\n")
            for lim in limitations:
                lines.append(f"* {lim}")

        citations = r.get("citations", [])
        if citations:
            lines.append("\n## Traceable Citations\n")
            for cit in citations:
                tag = cit.get("citation_tag", "[Citation]")
                typ = cit.get("citation_type", "web")
                target = cit.get("url_or_filename", "")
                snippet = cit.get("snippet", "")
                if typ == "web":
                    lines.append(f"* **{tag}**: [{cit.get('title', target)}]({target})\n  > \"{snippet}\"\n")
                else:
                    lines.append(f"* **{tag}**: {target}\n  > \"{snippet}\"\n")

        return "\n".join(lines)

    @staticmethod
    async def recover_dangling_jobs() -> None:
        """Invoked on application startup to safely reconcile any orphaned jobs from restarts."""
        async with async_session_factory() as db:
            stmt = select(ResearchJob).where(
                ResearchJob.status.in_(["planning", "running", "synthesizing"])
            )
            dangling = list((await db.execute(stmt)).scalars().all())
            for job in dangling:
                job.status = "failed"
                job.error_message = "Research job was interrupted by an unexpected server restart. Please re-run."
                job.updated_at = utc_now()
                evt = ResearchEvent(
                    id=str(uuid.uuid4()),
                    job_id=job.id,
                    event_type="error",
                    message="Job interrupted by server restart.",
                    created_at=utc_now(),
                )
                db.add(evt)
            if dangling:
                await db.commit()
                logger.info("Reconciled %d dangling research jobs from previous session.", len(dangling))

    @staticmethod
    async def _execute_job(job_id: str) -> None:
        """Background pipeline: Discover -> Collect -> Synthesize."""
        worker_id = f"research-worker-{uuid.uuid4().hex[:8]}"

        # 1. Atomically claim job
        async with async_session_factory() as db:
            stmt = (
                update(ResearchJob)
                .where(
                    ResearchJob.id == job_id,
                    ResearchJob.status.in_(["planning", "running", "awaiting_approval"]),
                    or_(ResearchJob.claimed_by_worker.is_(None), ResearchJob.claimed_by_worker == worker_id),
                )
                .values(claimed_by_worker=worker_id, status="running", updated_at=utc_now())
            )
            res = await db.execute(stmt)
            if res.rowcount == 0:
                logger.info("Research job %s was already claimed; awaiting completion if running.", job_id)
                # If already claimed by another concurrent task, wait for it to complete
                for _ in range(60):
                    await asyncio.sleep(0.1)
                    existing = await db.get(ResearchJob, job_id)
                    if existing and existing.status in ("completed", "failed", "cancelled"):
                        return
                return
            await db.commit()

        # 2. Fetch initial job parameters
        async with async_session_factory() as db:
            job = await db.get(ResearchJob, job_id)
            if not job or job.status == "cancelled":
                return
            question = job.question
            depth = job.depth
            allowed_domains = job.allowed_domains
            file_ids = job.file_ids
            max_sources = job.max_sources
            owner_id = job.owner_id

        try:
            # 2. Search / Source Discovery (outside DB session)
            search_provider = get_search_provider()
            discovered = await search_provider.search(
                query=question,
                num_results=max_sources,
                allowed_domains=allowed_domains,
            )

            # Deduplicate discovered canonical URLs
            seen_urls = set()
            sources_to_collect: List[Dict[str, Any]] = []

            for item in discovered:
                canon = canonicalize_url(item.url)
                if not canon or canon in seen_urls:
                    continue
                seen_urls.add(canon)

                sources_to_collect.append({
                    "id": str(uuid.uuid4()),
                    "canonical_url": canon,
                    "title": item.title,
                    "publisher": item.publisher or extract_publisher(canon),
                    "snippets": [item.snippet] if item.snippet else [],
                })

            # Record discovered sources in DB
            async with async_session_factory() as db:
                job = await db.get(ResearchJob, job_id)
                if not job or job.status == "cancelled":
                    return

                for s_data in sources_to_collect:
                    src_rec = ResearchSource(
                        id=s_data["id"],
                        job_id=job.id,
                        owner_id=job.owner_id,
                        canonical_url=s_data["canonical_url"],
                        title=s_data["title"],
                        publisher=s_data["publisher"],
                        snippets=s_data["snippets"],
                        status="pending",
                        validation_status="valid",
                        created_at=utc_now(),
                    )
                    db.add(src_rec)

                evt_disc = ResearchEvent(
                    id=str(uuid.uuid4()),
                    job_id=job.id,
                    event_type="source_discovered",
                    message=f"Discovered {len(sources_to_collect)} unique candidate web sources.",
                    payload={"sources_count": len(sources_to_collect)},
                    created_at=utc_now(),
                )
                db.add(evt_disc)
                await db.commit()

            # 3. Evidence Collection
            collector = WebCollector()
            keywords = question.split()

            for s_data in sources_to_collect:
                # Check cancellation before fetching
                async with async_session_factory() as db:
                    job = await db.get(ResearchJob, job_id)
                    if not job or job.status == "cancelled":
                        return

                collected = await collector.fetch_and_extract(
                    target_url=s_data["canonical_url"],
                    keywords=keywords,
                    allowed_domains=allowed_domains,
                )

                # Update source record in DB
                async with async_session_factory() as db:
                    job = await db.get(ResearchJob, job_id)
                    if not job or job.status == "cancelled":
                        return

                    src_rec = await db.get(ResearchSource, s_data["id"])
                    if src_rec:
                        src_rec.title = collected.title or src_rec.title
                        src_rec.publisher = collected.publisher or src_rec.publisher
                        src_rec.status = collected.status
                        src_rec.validation_status = collected.validation_status
                        src_rec.publication_date = collected.publication_date
                        src_rec.content_hash = collected.content_hash
                        if collected.snippets:
                            src_rec.snippets = collected.snippets

                        evt_collect = ResearchEvent(
                            id=str(uuid.uuid4()),
                            job_id=job.id,
                            event_type="source_retrieved",
                            message=f"Collected evidence from {src_rec.publisher} ({src_rec.status}, {src_rec.validation_status}).",
                            payload={
                                "url": src_rec.canonical_url,
                                "status": src_rec.status,
                                "snippets_count": len(src_rec.snippets or []),
                            },
                            created_at=utc_now(),
                        )
                        db.add(evt_collect)
                        await db.commit()

            # Check cancellation
            async with async_session_factory() as db:
                job = await db.get(ResearchJob, job_id)
                if not job or job.status == "cancelled":
                    return

            # 4. Document Evidence (Phase 5 Knowledge integration)
            doc_citations: List[ChunkCitation] = []
            if file_ids:
                try:
                    async with async_session_factory() as db:
                        citations, _ = await KnowledgeService.search(
                            db=db,
                            owner_id=owner_id,
                            query=question,
                            file_ids=file_ids,
                            top_k=5,
                        )
                        doc_citations = citations
                        if doc_citations:
                            evt_doc = ResearchEvent(
                                id=str(uuid.uuid4()),
                                job_id=job_id,
                                event_type="evidence_extracted",
                                message=f"Retrieved {len(doc_citations)} relevant document passages for correlation.",
                                created_at=utc_now(),
                            )
                            db.add(evt_doc)
                            await db.commit()
                except Exception as e:
                    logger.warning("Failed retrieving user document evidence for research: %s", e)

            # 5. Transition to synthesizing
            async with async_session_factory() as db:
                job = await db.get(ResearchJob, job_id)
                if not job or job.status == "cancelled":
                    return
                job.status = "synthesizing"
                job.updated_at = utc_now()
                evt_synth = ResearchEvent(
                    id=str(uuid.uuid4()),
                    job_id=job.id,
                    event_type="synthesis_started",
                    message="Synthesizing grounded research report.",
                    created_at=utc_now(),
                )
                db.add(evt_synth)
                # Fetch fresh list of sources from db to pass to synthesizer
                src_stmt = select(ResearchSource).where(ResearchSource.job_id == job_id).order_by(ResearchSource.created_at.asc())
                web_sources_list = list((await db.execute(src_stmt)).scalars().all())
                await db.commit()

            # 6. Synthesis (outside DB session)
            report = await ResearchSynthesizer.synthesize(
                question=question,
                web_sources=web_sources_list,
                doc_citations=doc_citations,
            )

            # 7. Complete job in DB
            async with async_session_factory() as db:
                job = await db.get(ResearchJob, job_id)
                if not job or job.status == "cancelled":
                    return
                job.final_report = report.model_dump()
                job.status = "completed"
                job.completed_at = utc_now()
                job.updated_at = utc_now()

                evt_done = ResearchEvent(
                    id=str(uuid.uuid4()),
                    job_id=job.id,
                    event_type="report_generated",
                    message=f"Research report synthesized with {len(report.citations)} citations.",
                    payload={"citations_count": len(report.citations)},
                    created_at=utc_now(),
                )
                db.add(evt_done)
                await db.commit()

        except Exception as exc:
            logger.error("Research execution failed for job %s: %s", job_id, exc, exc_info=True)
            async with async_session_factory() as db:
                job = await db.get(ResearchJob, job_id)
                if job:
                    job.status = "failed"
                    job.error_message = f"Research failed: {str(exc)}"
                    job.updated_at = utc_now()
                    evt_err = ResearchEvent(
                        id=str(uuid.uuid4()),
                        job_id=job.id,
                        event_type="error",
                        message=f"Execution error: {str(exc)}",
                        created_at=utc_now(),
                    )
                    db.add(evt_err)
                    await db.commit()
