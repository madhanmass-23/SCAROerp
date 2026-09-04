$keytool = "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe"
$keystorePath = "e:\scaroerp\scaro\scaro\android\release-keystore.jks"
$propsPath = "e:\scaroerp\scaro\scaro\android\release-signing.properties"

# Generate random secure 24-character password
$chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
$rnd = New-Object System.Random
$passArray = (1..24) | ForEach-Object { $chars[$rnd.Next($chars.Length)] }
$password = -join $passArray

if (-not (Test-Path $keystorePath)) {
    & $keytool -genkeypair -v `
        -keystore $keystorePath `
        -alias "scarokey" `
        -keyalg RSA `
        -keysize 2048 `
        -validity 10000 `
        -storepass $password `
        -keypass $password `
        -dname "CN=SCARO ERP, OU=Mobile, O=SCARO Technologies, L=Bengaluru, ST=Karnataka, C=IN"
    
    $content = @"
storeFile=release-keystore.jks
storePassword=$password
keyAlias=scarokey
keyPassword=$password
"@
    Set-Content -Path $propsPath -Value $content -NoNewline
    Write-Host "Keystore and release-signing.properties created securely."
} else {
    Write-Host "Keystore already exists."
}
