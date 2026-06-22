# Test script to verify the upload endpoint works
# This simulates what Revit should be doing

Write-Host "Testing Revit Sync Server upload endpoint..."
Write-Host ""

# Create a small test file
$testFile = [System.IO.Path]::GetTempFileName()
"Test IFC content" | Out-File -FilePath $testFile -Encoding ASCII

try {
    # Read file as bytes
    $fileBytes = [System.IO.File]::ReadAllBytes($testFile)
    
    # Create multipart form data
    $boundary = [System.Guid]::NewGuid().ToString()
    $LF = "`r`n"
    
    $bodyParts = @(
        "--$boundary",
        "Content-Disposition: form-data; name=`"file`"; filename=`"test.ifc`"",
        "Content-Type: application/octet-stream",
        "",
        [System.Text.Encoding]::GetEncoding("iso-8859-1").GetString($fileBytes),
        "--$boundary",
        "Content-Disposition: form-data; name=`"sessionId`"",
        "",
        "test-session-123",
        "--$boundary",
        "Content-Disposition: form-data; name=`"fileName`"",
        "",
        "test.ifc",
        "--$boundary--"
    )
    
    $body = $bodyParts -join $LF
    $bodyBytes = [System.Text.Encoding]::GetEncoding("iso-8859-1").GetBytes($body)
    
    # Create request
    $uri = "http://localhost:3002/api/revit/upload"
    $request = [System.Net.HttpWebRequest]::Create($uri)
    $request.Method = "POST"
    $request.ContentType = "multipart/form-data; boundary=$boundary"
    $request.ContentLength = $bodyBytes.Length
    
    Write-Host "Sending test upload to: $uri"
    Write-Host "File size: $($fileBytes.Length) bytes"
    Write-Host ""
    
    # Send request
    $requestStream = $request.GetRequestStream()
    $requestStream.Write($bodyBytes, 0, $bodyBytes.Length)
    $requestStream.Close()
    
    # Get response
    $response = $request.GetResponse()
    $responseStream = $response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($responseStream)
    $responseText = $reader.ReadToEnd()
    $reader.Close()
    $responseStream.Close()
    $response.Close()
    
    Write-Host "✅ Upload successful!"
    Write-Host "Response: $responseText"
    Write-Host ""
    Write-Host "Check your server console - you should see:"
    Write-Host "  [RevitSync] POST /api/revit/upload"
    Write-Host "  [RevitSync] 📥 UPLOAD REQUEST RECEIVED"
    Write-Host "  [RevitSync] ✅ Received IFC upload: test.ifc"
    
} catch {
    Write-Host "❌ Upload failed!"
    Write-Host "Error: $($_.Exception.Message)"
    Write-Host ""
    Write-Host "Possible issues:"
    Write-Host "  - Server not running (check START_REVIT_SYNC_SERVER.bat)"
    Write-Host "  - Wrong port (should be 3002)"
    Write-Host "  - Firewall blocking"
} finally {
    # Cleanup
    if (Test-Path $testFile) {
        Remove-Item $testFile -Force
    }
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
