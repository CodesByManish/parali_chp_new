@echo off

REM Change this path to the actual, absolute path of your weighbridge-server folder set
 "SERVER_PATH=D:\modbusTest"

REM Optional: Navigate to the directory if you have relative paths inside your index.js

REM cd /d "%SERVER PATH%"

REM Run the Node.js server using the absolute path

node "%SERVER_PATH%\index.js"

pause