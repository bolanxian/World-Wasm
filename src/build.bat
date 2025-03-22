
@echo off
setlocal enabledelayedexpansion
mkdir "temp"
cd "temp"

set "CC=zig c++"
set "TARGET=wasm32-wasi"
set "CFLAGS=-lc -lc++ -flto --target=%TARGET% -I ../deps/World/src/ -I ../deps/World/ -O3"
set "ZFLAGS=-lc -lc++ -flto -target %TARGET% -I../deps/World/src/ -I../deps/World/ -O ReleaseSmall"
set "WFLAGS=-mexec-model=reactor --initial-memory=17039360 -fno-builtin -fno-entry"
set "EXPORTS=--export=_get_info --export=_init_world --export=_destruct --export=_wavreadlength --export=_wavread --export=_wavwrite"
set "EXPORTS=%EXPORTS% --export=_dio --export=_harvest --export=_stonemask --export=_cheaptrick --export=_d4c --export=_synthesis"
set "FILES=extern.o"

echo on
%CC% -c "../src/extern.cpp" -o "extern.o" %CFLAGS%

for %%i in (matlabfunctions common fft dio harvest stonemask cheaptrick d4c synthesis) do (
  if not exist "%%i.o" (
    %CC% -c "../src/extern.cpp" -D "__INNER__=""%%i.cpp""" -o "%%i.o" %CFLAGS%
  )
  set "FILES=!FILES! %%i.o"
)
for %%i in (audioio) do (
  if not exist "%%i.o" (
    %CC% -c "../src/extern.cpp" -D "__INNER__=""tools/%%i.cpp""" -o "%%i.o" %CFLAGS%
  )
  set "FILES=!FILES! %%i.o"
)

zig build-exe "../src/main.zig" %FILES% %ZFLAGS% %WFLAGS% %EXPORTS%

move "main.wasm" "../deps/world.wasm"