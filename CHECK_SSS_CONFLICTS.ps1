# SSS Conflict Checker
# Checks for conflicts that might prevent SSS from working

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "SSS Conflict Checker" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check 1: Multiple SSS implementations
Write-Host "1. Checking for multiple SSS implementations..." -ForegroundColor Yellow
$sssFiles = Get-ChildItem -Path "src" -Recurse -Filter "*SSS*" -ErrorAction SilentlyContinue
if ($sssFiles) {
    Write-Host "   Found SSS-related files:" -ForegroundColor Cyan
    $sssFiles | ForEach-Object { Write-Host "     - $($_.FullName)" -ForegroundColor Gray }
} else {
    Write-Host "   ✓ No duplicate SSS files found" -ForegroundColor Green
}
Write-Host ""

# Check 2: Shadow system conflicts
Write-Host "2. Checking for shadow system conflicts..." -ForegroundColor Yellow
$shadowConflicts = Select-String -Path "src\viewer\*.ts" -Pattern "shadowMap|ShadowMap|CSM|csm" -CaseSensitive:$false | Select-Object -First 10
if ($shadowConflicts) {
    Write-Host "   ⚠️ Found shadow-related code (may conflict with SSS):" -ForegroundColor Yellow
    $shadowConflicts | ForEach-Object { 
        Write-Host "     - $($_.Filename):$($_.LineNumber) - $($_.Line.Trim())" -ForegroundColor Gray 
    }
} else {
    Write-Host "   ✓ No obvious shadow conflicts" -ForegroundColor Green
}
Write-Host ""

# Check 3: Post-processing pass order
Write-Host "3. Checking post-processing pass order..." -ForegroundColor Yellow
$postProcessingFile = "src\viewer\postprocessing\PostProcessingSystem.ts"
if (Test-Path $postProcessingFile) {
    $content = Get-Content $postProcessingFile -Raw
    $sssAddCount = ([regex]::Matches($content, "addPass.*sss|sssPass.*addPass" -CaseSensitive:$false)).Count
    $sssInitCount = ([regex]::Matches($content, "sssPass.*=.*new|new.*SSS" -CaseSensitive:$false)).Count
    
    Write-Host "   SSS pass creation count: $sssInitCount" -ForegroundColor $(if ($sssInitCount -eq 1) { "Green" } else { "Red" })
    Write-Host "   SSS pass add count: $sssAddCount" -ForegroundColor $(if ($sssAddCount -le 2) { "Green" } else { "Red" })
    
    if ($sssInitCount -gt 1 -or $sssAddCount -gt 2) {
        Write-Host "   ⚠️ WARNING: SSS pass might be created/added multiple times!" -ForegroundColor Red
    } else {
        Write-Host "   ✓ SSS pass creation looks correct" -ForegroundColor Green
    }
} else {
    Write-Host "   ✗ PostProcessingSystem.ts not found" -ForegroundColor Red
}
Write-Host ""

# Check 4: Depth texture conflicts
Write-Host "4. Checking for depth texture conflicts..." -ForegroundColor Yellow
$depthFiles = Get-ChildItem -Path "src" -Recurse -Filter "*Depth*" -ErrorAction SilentlyContinue
if ($depthFiles) {
    Write-Host "   Found depth-related files:" -ForegroundColor Cyan
    $depthFiles | ForEach-Object { Write-Host "     - $($_.Name)" -ForegroundColor Gray }
    
    $depthPassCount = ($depthFiles | Where-Object { $_.Name -like "*Depth*Pass*" }).Count
    if ($depthPassCount -gt 1) {
        Write-Host "   ⚠️ WARNING: Multiple depth passes found - might conflict!" -ForegroundColor Red
    } else {
        Write-Host "   ✓ Depth pass count looks OK" -ForegroundColor Green
    }
} else {
    Write-Host "   ✗ No depth files found" -ForegroundColor Red
}
Write-Host ""

# Check 5: Shader conflicts
Write-Host "5. Checking for shader conflicts..." -ForegroundColor Yellow
$shaderFiles = Get-ChildItem -Path "src\viewer\postprocessing" -Filter "*Shader.ts" -ErrorAction SilentlyContinue
if ($shaderFiles) {
    Write-Host "   Post-processing shaders:" -ForegroundColor Cyan
    $shaderFiles | ForEach-Object { Write-Host "     - $($_.Name)" -ForegroundColor Gray }
    
    # Check if any shader uses tDepth (might conflict with SSS)
    $conflictingShaders = @()
    foreach ($file in $shaderFiles) {
        $content = Get-Content $file.FullName -Raw
        if ($content -match "tDepth" -and $file.Name -ne "SSSShader.ts") {
            $conflictingShaders += $file.Name
        }
    }
    
    if ($conflictingShaders) {
        Write-Host "   ⚠️ WARNING: Other shaders also use tDepth (might conflict):" -ForegroundColor Red
        $conflictingShaders | ForEach-Object { Write-Host "     - $_" -ForegroundColor Red }
    } else {
        Write-Host "   ✓ No tDepth conflicts found" -ForegroundColor Green
    }
} else {
    Write-Host "   ✗ No shader files found" -ForegroundColor Red
}
Write-Host ""

# Check 6: Render order
Write-Host "6. Checking render order..." -ForegroundColor Yellow
if (Test-Path $postProcessingFile) {
    $content = Get-Content $postProcessingFile -Raw
    $expectedOrder = "Render.*AO.*SSS.*SSR"
    if ($content -match $expectedOrder) {
        Write-Host "   ✓ Expected pass order found: Render → AO → SSS → SSR" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️ Expected pass order might not be correct" -ForegroundColor Yellow
    }
    
    # Check if SSS is added in initialize AND updateConfig
    $initSSS = $content -match "initialize.*sss|sss.*enabled.*camera.*sssPass.*=.*new"
    $updateSSS = $content -match "updateConfig.*sss|shouldHaveSSS.*hasSSS"
    
    if ($initSSS -and $updateSSS) {
        Write-Host "   ⚠️ WARNING: SSS might be added in both initialize() AND updateConfig()!" -ForegroundColor Red
        Write-Host "      This could cause duplicate passes or conflicts." -ForegroundColor Red
    } else {
        Write-Host "   ✓ SSS initialization looks OK" -ForegroundColor Green
    }
}
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Common SSS issues to check:" -ForegroundColor Yellow
Write-Host "  1. Post-processing must be enabled" -ForegroundColor White
Write-Host "  2. SSS must be enabled" -ForegroundColor White
Write-Host "  3. Depth texture must be rendered (depth prepass)" -ForegroundColor White
Write-Host "  4. SSS pass must be in correct order (after Render, before SSR)" -ForegroundColor White
Write-Host "  5. tDiffuse must come from previous pass (RenderPass or AO)" -ForegroundColor White
Write-Host "  6. No duplicate SSS passes" -ForegroundColor White
Write-Host ""



















































