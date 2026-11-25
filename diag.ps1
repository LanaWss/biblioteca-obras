$email = "qa$([DateTimeOffset]::Now.ToUnixTimeMilliseconds())@teste.com"
$corpo = @{ nome = "QA Teste"; email = $email; senha = "senha123"; aceitouTermos = $true } | ConvertTo-Json
$cadastro = Invoke-RestMethod -Uri "http://127.0.0.1:3000/usuarios" -Method Post -ContentType "application/json" -Body $corpo
$login = Invoke-RestMethod -Uri "http://127.0.0.1:3000/login" -Method Post -ContentType "application/json" -Body ( @{ email = $email; senha = "senha123" } | ConvertTo-Json )
$token = $login.token
"email=$email"
$nova = Invoke-RestMethod -Uri "http://127.0.0.1:3000/obras" -Method Post -Headers @{Authorization = "Bearer $token" } -ContentType "application/json" -Body '{"nome":"Obra QA Fundo","tipo":"anime","status":"completa","temporadas":[{"numero":1,"episodios":12,"inicio":1}],"volumes":[],"imagem":"https://picsum.photos/300/420","imagem_preferencia":"url","links_leitura":[]}'
"obra criada id=$($nova.id)"
$email | Set-Content -Path C:\Users\SAP0000344\Documents\biblioteca-obras\qa-email.txt
