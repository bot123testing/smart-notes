@echo off
title Elasticsearch 9.5.5
echo ======================================================================
echo Starting Elasticsearch 9.5.5 on Port 9200...
echo Note: Elasticsearch takes about 25-30 seconds to allocate JVM memory.
echo Keep this command prompt window OPEN while running Smart Notes+.
echo ======================================================================

if defined ES_HOME (
    cd /d "%ES_HOME%\bin"
    call elasticsearch.bat
    goto :eof
)

if exist "C:\Users\aryan\Downloads\elasticsearch-9.5.5-windows-x86_64\elasticsearch-9.5.5\bin\elasticsearch.bat" (
    cd /d "C:\Users\aryan\Downloads\elasticsearch-9.5.5-windows-x86_64\elasticsearch-9.5.5\bin"
    call elasticsearch.bat
    goto :eof
)

echo [ERROR] Elasticsearch not found at default path or ES_HOME.
echo Please start Elasticsearch via Docker (docker-compose up -d elasticsearch) or configure ES_HOME.
pause
