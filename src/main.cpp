
#include <errno.h>
#include <math.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <emscripten.h>

#include "world/matlabfunctions.h"
#include "world/common.h"
#include "world/fft.h"
#include "world/dio.h"
#include "world/harvest.h"
#include "world/stonemask.h"
#include "world/cheaptrick.h"
#include "world/d4c.h"
#include "world/synthesis.h"
#include "tools/audioio.h"

extern "C"
{
  // from emsdk/upstream/emscripten/system/lib/standalone/standalone.c
  int __syscall_openat(int dirfd, intptr_t _path, int flags, ...)
  {
    auto path = (const char *)_path;
    if (!strcmp(path, "/dev/stdin"))
    {
      return STDIN_FILENO;
    }
    if (!strcmp(path, "/dev/stdout"))
    {
      return STDOUT_FILENO;
    }
    if (!strcmp(path, "/dev/stderr"))
    {
      return STDERR_FILENO;
    }
    if (!strcmp(path, "sample.wav"))
    {
      return 3;
    }
    return -EPERM;
  }

  EMSCRIPTEN_KEEPALIVE int _get_info()
  {
#define PRINTDEF(def) printf(#def " = %d\n", def)
#define PRINTSIZE(type) printf("sizeof(" #type ") = %lu\n", sizeof(type))
    printf("World Vocoder for WebAssembly\n");
    printf("Emscripten %d.%d.%d\n", __EMSCRIPTEN_major__, __EMSCRIPTEN_minor__, __EMSCRIPTEN_tiny__);
    printf(__VERSION__ "\n");
    printf("Compiled: " __DATE__ " " __TIME__ "\n");
    printf("__cplusplus = %ld\n", __cplusplus);
    PRINTDEF(__wasm__);
    PRINTDEF(__ORDER_BIG_ENDIAN__);
    PRINTDEF(__ORDER_LITTLE_ENDIAN__);
    PRINTDEF(__ORDER_PDP_ENDIAN__);
    PRINTDEF(__BYTE_ORDER__);
    const int32_t byteorder = 0x04030201;
    printf("byteorder = %hhd%hhd%hhd%hhd\n",
           ((char *)&byteorder)[0], ((char *)&byteorder)[1],
           ((char *)&byteorder)[2], ((char *)&byteorder)[3]);
    PRINTSIZE(void *);
    PRINTSIZE(char);
    PRINTSIZE(short);
    PRINTSIZE(int);
    PRINTSIZE(long);
    PRINTSIZE(long long);
    PRINTSIZE(float);
    PRINTSIZE(double);
    PRINTSIZE(long double);
    PRINTSIZE(DioOption);
    PRINTSIZE(HarvestOption);
    PRINTSIZE(CheapTrickOption);
    PRINTSIZE(D4COption);
#undef PRINTDEF
#undef PRINTSIZE
    return 0;
  }

  EMSCRIPTEN_KEEPALIVE inline double **createFloat64Array2D(int x, int y)
  {
    double **array = new double *[x];
    for (int i = 0; i < x; i++)
    {
      array[i] = new double[y];
    }
    return array;
  }
  EMSCRIPTEN_KEEPALIVE inline void deleteFloat64Array2D(double **ptr, int x)
  {
    for (int i = 0; i < x; i++)
    {
      delete[] ptr[i];
    }
    delete[] ptr;
  }

  EM_JS(void, readFloat64Array, (int fd, double *ptr, int length), {})
  EM_JS(void, writeFloat64Array, (int fd, double *ptr, int length), {})
  EM_JS(void, readFloat64Array2D, (int fd, double **ptr, int x, int y), {})
  EM_JS(void, writeFloat64Array2D, (int fd, double **ptr, int x, int y), {})

  EMSCRIPTEN_KEEPALIVE int _wavreadlength()
  {
    const char *path = "sample.wav";
    int x_length = GetAudioLength(path);
    return x_length;
  }
  EMSCRIPTEN_KEEPALIVE int _wavread(int x_length)
  {
    const char *path = "sample.wav";
    int fs, nbit;
    double *x = new double[x_length > 2 ? x_length : 2];
    wavread(path, &fs, &nbit, x);
    if (fs > 0)
    {
      writeFloat64Array(0, x, x_length);
      x[0] = fs;
      x[1] = nbit;
      writeFloat64Array(1, x, 2);
    }
    delete[] x;
    return fs;
  }
  EMSCRIPTEN_KEEPALIVE void _wavwrite(int x_length, int fs)
  {
    const char *path = "sample.wav";
    double *x = new double[x_length];
    readFloat64Array(0, x, x_length);
    wavwrite(x, x_length, fs, 16, path);
    delete[] x;
  }

  DioOption dioOption = {0};
  HarvestOption harvestOption = {0};
  CheapTrickOption cheapTrickOption = {0};
  D4COption d4cOption = {0};

  EMSCRIPTEN_KEEPALIVE int _init_world(int fs, double f0_floor, double f0_ceil)
  {
    InitializeDioOption(&dioOption);
    InitializeHarvestOption(&harvestOption);
    InitializeCheapTrickOption(fs, &cheapTrickOption);
    InitializeD4COption(&d4cOption);
    if (f0_floor > 0)
    {
      dioOption.f0_floor = f0_floor;
      harvestOption.f0_floor = f0_floor;
      cheapTrickOption.f0_floor = f0_floor;
      cheapTrickOption.fft_size = GetFFTSizeForCheapTrick(fs, &cheapTrickOption);
    }
    if (f0_ceil > 0)
    {
      dioOption.f0_ceil = f0_ceil;
      harvestOption.f0_ceil = f0_ceil;
    }
    return cheapTrickOption.fft_size;
  }

  EMSCRIPTEN_KEEPALIVE void _dio(int x_length, int fs, double frame_period, int withStoneMask)
  {
    double *x = new double[x_length];
    readFloat64Array(0, x, x_length);
    dioOption.frame_period = frame_period;
    int f0_length = GetSamplesForDIO(fs, x_length, dioOption.frame_period);
    double *t = new double[f0_length];
    double *f0 = new double[f0_length];
    Dio(x, x_length, fs, &dioOption, t, f0);
    writeFloat64Array(1, t, f0_length);
    if (withStoneMask)
    {
      double *refined_f0 = new double[f0_length];
      StoneMask(x, x_length, fs, t, f0, f0_length, refined_f0);
      writeFloat64Array(2, refined_f0, f0_length);
      delete[] refined_f0;
    }
    else
    {
      writeFloat64Array(2, f0, f0_length);
    }
    delete[] x;
    delete[] t;
    delete[] f0;
  }

  EMSCRIPTEN_KEEPALIVE void _harvest(int x_length, int fs, double frame_period, int withStoneMask)
  {
    double *x = new double[x_length];
    readFloat64Array(0, x, x_length);
    harvestOption.frame_period = frame_period;
    int f0_length = GetSamplesForHarvest(fs, x_length, dioOption.frame_period);
    double *t = new double[f0_length];
    double *f0 = new double[f0_length];
    Harvest(x, x_length, fs, &harvestOption, t, f0);
    writeFloat64Array(1, t, f0_length);
    if (withStoneMask)
    {
      double *refined_f0 = new double[f0_length];
      StoneMask(x, x_length, fs, t, f0, f0_length, refined_f0);
      writeFloat64Array(2, refined_f0, f0_length);
      delete[] refined_f0;
    }
    else
    {
      writeFloat64Array(2, f0, f0_length);
    }
    delete[] x;
    delete[] t;
    delete[] f0;
  }

  EMSCRIPTEN_KEEPALIVE void _stonemask(int x_length, int fs, int f0_length)
  {
    double *x = new double[x_length];
    double *t = new double[f0_length];
    double *f0 = new double[f0_length];
    double *refined_f0 = new double[f0_length];
    readFloat64Array(0, x, x_length);
    readFloat64Array(1, t, f0_length);
    readFloat64Array(2, f0, f0_length);
    StoneMask(x, x_length, fs, t, f0, f0_length, refined_f0);
    writeFloat64Array(2, refined_f0, f0_length);
    delete[] x;
    delete[] t;
    delete[] f0;
    delete[] refined_f0;
  }

  EMSCRIPTEN_KEEPALIVE int _cheaptrick(int x_length, int fs, int f0_length)
  {
    double *x = new double[x_length];
    double *t = new double[f0_length];
    double *f0 = new double[f0_length];
    readFloat64Array(0, x, x_length);
    readFloat64Array(1, t, f0_length);
    readFloat64Array(2, f0, f0_length);
    int fft_size = cheapTrickOption.fft_size = GetFFTSizeForCheapTrick(fs, &cheapTrickOption);
    double **spectrogram = createFloat64Array2D(f0_length, fft_size / 2 + 1);
    CheapTrick(x, x_length, fs, t, f0, f0_length, &cheapTrickOption, spectrogram);
    writeFloat64Array2D(3, spectrogram, f0_length, fft_size / 2 + 1);
    deleteFloat64Array2D(spectrogram, f0_length);
    delete[] x;
    delete[] t;
    delete[] f0;
    return fft_size;
  }

  EMSCRIPTEN_KEEPALIVE void _d4c(int x_length, int fs, int f0_length, int fft_size)
  {
    double *x = new double[x_length];
    double *t = new double[f0_length];
    double *f0 = new double[f0_length];
    readFloat64Array(0, x, x_length);
    readFloat64Array(1, t, f0_length);
    readFloat64Array(2, f0, f0_length);
    if (fft_size <= 0)
    {
      fft_size = GetFFTSizeForCheapTrick(fs, &cheapTrickOption);
    }
    double **aperiodicity = createFloat64Array2D(f0_length, fft_size / 2 + 1);
    D4C(x, x_length, fs, t, f0, f0_length, fft_size, &d4cOption, aperiodicity);
    writeFloat64Array2D(4, aperiodicity, f0_length, fft_size / 2 + 1);
    deleteFloat64Array2D(aperiodicity, f0_length);
    delete[] x;
    delete[] t;
    delete[] f0;
  }

  EMSCRIPTEN_KEEPALIVE void _synthesis(int f0_length, int fft_size, int fs, int frame_period)
  {
    double *f0 = new double[f0_length];
    double **aperiodicity = new double *[f0_length];
    double **spectrogram = new double *[f0_length];
    for (int i = 0; i < f0_length; i++)
    {
      spectrogram[i] = new double[fft_size / 2 + 1];
      aperiodicity[i] = new double[fft_size / 2 + 1];
    }
    readFloat64Array(2, f0, f0_length);
    readFloat64Array2D(3, spectrogram, f0_length, fft_size / 2 + 1);
    readFloat64Array2D(4, aperiodicity, f0_length, fft_size / 2 + 1);
    int y_length = static_cast<int>((f0_length - 1) * frame_period / 1000.0 * fs) + 1;
    double *y = new double[y_length];
    Synthesis(f0, f0_length, spectrogram, aperiodicity, fft_size, frame_period, fs, y_length, y);
    writeFloat64Array(0, y, y_length);
    for (int i = 0; i < f0_length; i++)
    {
      delete[] spectrogram[i];
      delete[] aperiodicity[i];
    }
    delete[] spectrogram;
    delete[] aperiodicity;
    delete[] f0;
    delete[] y;
  }
}