# AI Resume Platform Setup Script
Write-Host "🚀 Setting up AI Resume Platform..." -ForegroundColor Cyan

# Check if .env exists and has OpenAI key
$envPath = "backend\.env"
if (Test-Path $envPath) {
    $envContent = Get-Content $envPath -Raw
    if ($envContent -match "your-openai-api-key-here") {
        Write-Host "⚠️  WARNING: Please update backend\.env with your OpenAI API key!" -ForegroundColor Yellow
        Write-Host "   Edit backend\.env and replace 'your-openai-api-key-here' with your actual key" -ForegroundColor Yellow
    } else {
        Write-Host "✅ .env file configured" -ForegroundColor Green
    }
} else {
    Write-Host "❌ .env file not found. Please create it from .env.example" -ForegroundColor Red
    exit 1
}

# Check Docker
Write-Host "`n📦 Checking Docker..." -ForegroundColor Cyan
try {
    docker ps | Out-Null
    Write-Host "✅ Docker is running" -ForegroundColor Green
    
    # Check if Neo4j container exists
    $neo4jContainer = docker ps -a --filter "name=ai-resume-neo4j" --format "{{.Names}}"
    if ($neo4jContainer) {
        Write-Host "✅ Neo4j container found" -ForegroundColor Green
        $running = docker ps --filter "name=ai-resume-neo4j" --format "{{.Names}}"
        if ($running) {
            Write-Host "✅ Neo4j is running" -ForegroundColor Green
        } else {
            Write-Host "🔄 Starting Neo4j container..." -ForegroundColor Yellow
            docker-compose up -d
            Start-Sleep -Seconds 5
            Write-Host "✅ Neo4j started" -ForegroundColor Green
        }
    } else {
        Write-Host "🔄 Creating and starting Neo4j container..." -ForegroundColor Yellow
        docker-compose up -d
        Write-Host "⏳ Waiting for Neo4j to be ready (this may take 30 seconds)..." -ForegroundColor Yellow
        Start-Sleep -Seconds 30
        Write-Host "✅ Neo4j should be ready" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Docker is not running. Please start Docker Desktop first!" -ForegroundColor Red
    Write-Host "   Then run: docker-compose up -d" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n✅ Setup complete!" -ForegroundColor Green
Write-Host "`n📝 Next steps:" -ForegroundColor Cyan
Write-Host "   1. Make sure backend\.env has your OpenAI API key" -ForegroundColor White
Write-Host "   2. Start the app: npm run dev" -ForegroundColor White
Write-Host "   3. Open http://localhost:5173 in your browser" -ForegroundColor White

