$ErrorActionPreference = "Stop"
Write-Output "=== 1. Building Frontend (Vite) ==="
Set-Location "C:\Users\shiva\.gemini\antigravity\scratch\unified-ai-assistant\apps\web"
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Output "=== 2. Deploying to Cloudflare Workers ==="
Set-Location "C:\Users\shiva\.gemini\antigravity\scratch\unified-ai-assistant"
npx wrangler deploy --keep-vars
if ($LASTEXITCODE -ne 0) {
    Write-Error "Deploy failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Output "=== 3. Git Commit and Push ==="
git add .
git commit -m "feat: replace all emojis with crisp vector brand logos across UI and deploy live"
git push origin main

Write-Output "=== ALL DONE: DEPLOY_SUCCESS ==="
