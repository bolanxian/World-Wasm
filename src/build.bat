

where /Q emcc
if not %ERRORLEVEL%==0 (
  emsdk activate latest
)
mkdir "temp"
set "CFLAGS=-flto -I deps/World/src/ -I deps/World/ -O3"
set "EMCC_FLAGS=--no-entry -s ALLOW_MEMORY_GROWTH -s INITIAL_MEMORY=131072"

for %%i in (matlabfunctions common fft dio harvest stonemask cheaptrick d4c synthesis) do (
  if not exist "temp/%%i.o" (
    emcc -c -o "temp/%%i.o" "deps/World/src/%%i.cpp" %CFLAGS%
  )
)
if not exist "temp/audioio.o" (
  emcc -c -o "temp/audioio.o" "deps/World/tools/audioio.cpp" %CFLAGS%
)
if not exist "temp/main.o" (
  emcc -c -o "temp/main.o" "src/main.cpp" %CFLAGS%
)

emcc %CFLAGS% %EMCC_FLAGS% -o "temp/world.wasm" ^
temp/matlabfunctions.o ^
temp/common.o ^
temp/fft.o ^
temp/dio.o ^
temp/harvest.o ^
temp/stonemask.o ^
temp/cheaptrick.o ^
temp/d4c.o ^
temp/synthesis.o ^
temp/audioio.o ^
temp/main.o

pause