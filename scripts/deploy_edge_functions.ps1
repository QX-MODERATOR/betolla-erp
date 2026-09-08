# Betolla ERP - Automated Edge Functions Deployer
param(
    [string]$AccessToken
)

if ($AccessToken) {
    $env:SUPABASE_ACCESS_TOKEN = $AccessToken
    Write-Host "Supabase Access Token configured." -ForegroundColor Green
}

Write-Host "Linking Supabase project fdsawfdnxwzshlbcramf..." -ForegroundColor Cyan
npx supabase link --project-ref fdsawfdnxwzshlbcramf

Write-Host "Setting Google Calendar secret..." -ForegroundColor Cyan
npx supabase secrets set GOOGLE_CALENDAR_API_KEY=AIzaSyC4J_78XoISPpQye7Uy731n6YkHaw_qElE

Write-Host "Deploying Edge Function: ingest-lead..." -ForegroundColor Cyan
npx supabase functions deploy ingest-lead --no-verify-jwt

Write-Host "Deploying Edge Function: whatsapp-order..." -ForegroundColor Cyan
npx supabase functions deploy whatsapp-order --no-verify-jwt

Write-Host "Deploying Edge Function: calendar-reminder..." -ForegroundColor Cyan
npx supabase functions deploy calendar-reminder --no-verify-jwt

Write-Host "Deploying Edge Function: stock-alert..." -ForegroundColor Cyan
npx supabase functions deploy stock-alert --no-verify-jwt

Write-Host "`nAll 4 Edge Functions deployed successfully to Supabase Cloud!" -ForegroundColor Green
