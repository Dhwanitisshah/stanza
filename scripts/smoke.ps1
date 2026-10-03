# Smoke test for /api/analyze against a RUNNING dev server (npm run dev).
# Needs a real GEMINI_API_KEY in .env.local for the happy-path case.
# The rate-limit case uses up this IP's quota: wait ~60 s before running the script again.
param([string]$BaseUrl = "http://localhost:3000")

$ErrorActionPreference = "Stop"
$Endpoint = "$BaseUrl/api/analyze"
$Moods = @("Tender", "Melancholy", "Defiant", "Joyful", "Reverent", "Restless")
$Poem = "The lamp burns low beside the door,`nthe kettle hums a quiet tune,`nthe rain has found the wooden floor,`nand somewhere far, a patient moon."
$failures = 0

function Send-Analyze($Body) {
    $json = if ($Body -is [string]) { $Body } else { $Body | ConvertTo-Json -Compress }
    $response = Invoke-WebRequest -Uri $Endpoint -Method Post -ContentType "application/json" -Body $json -SkipHttpErrorCheck
    [pscustomobject]@{ Status = [int]$response.StatusCode; Json = ($response.Content | ConvertFrom-Json) }
}

function Report($Name, [bool]$Pass, $Detail = "") {
    if ($Pass) { Write-Host "PASS  $Name" -ForegroundColor Green }
    else { Write-Host "FAIL  $Name  $Detail" -ForegroundColor Red; $script:failures++ }
}

# 1. Happy path (real key): expects Gemini, not the fallback.
$r = Send-Analyze @{ poem = $Poem }
$a = $r.Json.analysis
$valid = $r.Status -eq 200 -and ($Moods -contains $a.mood) -and $a.intensity -ge 0 -and $a.intensity -le 1 -and $a.title -and $a.reading
Report "happy path returns a valid analysis" $valid "status=$($r.Status)"
Report "happy path used Gemini (source = gemini)" ($r.Json.source -eq "gemini") "source=$($r.Json.source) - check the key / GEMINI_MODEL in the server log"
Report "prosody scheme is ABAB" ($r.Json.prosody.scheme -eq "ABAB") "scheme=$($r.Json.prosody.scheme)"
if ($valid) { Write-Host "      mood=$($a.mood) title='$($a.title)' source=$($r.Json.source)" -ForegroundColor DarkGray }

# 2. skipAi: prosody + deterministic analysis, no Gemini.
$r = Send-Analyze @{ poem = $Poem; skipAi = $true }
Report "skipAi returns source = skipped" ($r.Status -eq 200 -and $r.Json.source -eq "skipped" -and ($Moods -contains $r.Json.analysis.mood)) "status=$($r.Status) source=$($r.Json.source)"

# 3. Oversize poem: friendly 400.
$r = Send-Analyze @{ poem = ("a line`n" * 50) }
Report "too many lines returns 400 with an error message" ($r.Status -eq 400 -and $r.Json.error.code -and $r.Json.error.message) "status=$($r.Status)"
$r = Send-Analyze @{ poem = ("a" * 2001) }
Report "over 2000 characters returns 400" ($r.Status -eq 400) "status=$($r.Status)"

# 4. Rate limit (last: it burns this IP's quota). Expect a 429 within 30 requests.
$codes = 1..30 | ForEach-Object { (Send-Analyze @{ poem = "hello"; skipAi = $true }).Status }
Report "rate limit returns 429" ($codes -contains 429) "statuses=$($codes -join ',')"

if ($failures -gt 0) { Write-Host "`n$failures case(s) FAILED" -ForegroundColor Red; exit 1 }
Write-Host "`nALL SMOKE CASES PASSED" -ForegroundColor Green
