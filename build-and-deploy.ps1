Set-Location "C:\Users\shiva\.gemini\antigravity\scratch\unified-ai-assistant"
Add-Content -Path "deploy-result.txt" -Value "Step 1: Starting Vite build at $(Get-Date)"

Set-Location "C:\Users\shiva\.gemini\antigravity\scratch\unified-ai-assistant\apps\web"
& node --max-old-space-size=1536 ./node_modules/vite/bin/vite.js build
if ($LASTEXITCODE -ne 0) {
    Add-Content -Path "..\deploy-result.txt" -Value "Vite build FAILED with code $LASTEXITCODE"
    exit $LASTEXITCODE
}
Add-Content -Path "..\deploy-result.txt" -Value "Step 1: Vite build SUCCESS at $(Get-Date)"

Set-Location "C:\Users\shiva\.gemini\antigravity\scratch\unified-ai-assistant"
Add-Content -Path "deploy-result.txt" -Value "Step 2: Starting Wrangler Deploy at $(Get-Date)"
& npx wrangler deploy --keep-vars
if ($LASTEXITCODE -ne 0) {
    Add-Content -Path "deploy-result.txt" -Value "Wrangler deploy FAILED with code $LASTEXITCODE"
    exit $LASTEXITCODE
}
Add-Content -Path "deploy-result.txt" -Value "Step 2: Wrangler deploy SUCCESS at $(Get-Date)"

Write-Output "ALL_DEPLOY_COMPLETE_SUCCESS"
