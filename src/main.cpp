
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

class Notifiable;
EM_JS(void, constructNotify, (Notifiable * ptr), {})
EM_JS(void, readFloat64Array, (int fd, double *ptr, int length), {})
EM_JS(void, writeFloat64Array, (int fd, double *ptr, int length), {})
EM_JS(void, readFloat64Array2D, (int fd, double *const *ptr, int width, int height), {})
EM_JS(void, writeFloat64Array2D, (int fd, double *const *ptr, int width, int height), {})

class Notifiable
{
public:
  Notifiable() { constructNotify(this); }
  virtual ~Notifiable() {}
};
class Float64Array : Notifiable
{
  Float64Array(double *ptr, int length) : ptr(ptr), length(length), Notifiable() {}

public:
  double *const ptr;
  const int length;
  static auto create(int length)
  {
    return new Float64Array(new double[length], length);
  }
  static auto from(int fd, int length)
  {
    auto array = Float64Array::create(length);
    readFloat64Array(fd, array->ptr, length);
    return array;
  }
  void read(int fd)
  {
    readFloat64Array(fd, ptr, length);
  }
  void read(int fd, int length)
  {
    readFloat64Array(fd, ptr, length);
  }
  void write(int fd)
  {
    writeFloat64Array(fd, ptr, length);
  }
  void write(int fd, int length)
  {
    writeFloat64Array(fd, ptr, length);
  }
  ~Float64Array() override
  {
    delete[] ptr;
  }
};
class Float64Array2D : Notifiable
{
  Float64Array2D(double *const *ptr, int width, int height)
      : ptr(ptr), width(width), height(height), Notifiable() {}

public:
  double *const *const ptr;
  const int width, height;
  static auto create(int width, int height)
  {
    auto ptr = new double *[width];
    for (int i = 0; i < width; i++)
    {
      ptr[i] = new double[height];
    }
    return new Float64Array2D(ptr, width, height);
  }
  static auto from(int fd, int width, int height)
  {
    auto array = Float64Array2D::create(width, height);
    readFloat64Array2D(fd, array->ptr, width, height);
    return array;
  }
  void read(int fd)
  {
    readFloat64Array2D(fd, ptr, width, height);
  }
  void write(int fd)
  {
    writeFloat64Array2D(fd, ptr, width, height);
  }
  ~Float64Array2D() override
  {
    for (int i = 0; i < width; i++)
    {
      delete[] ptr[i];
    }
    delete[] ptr;
  }
};

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
    printf("Compiled: " __DATE__ "\n");
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
    PRINTSIZE(Notifiable);
    PRINTSIZE(Float64Array);
    PRINTSIZE(Float64Array2D);
#undef PRINTDEF
#undef PRINTSIZE
    return 0;
  }

  EMSCRIPTEN_KEEPALIVE void _destruct(Notifiable *ptr)
  {
    delete ptr;
  }

  EMSCRIPTEN_KEEPALIVE int _wavreadlength()
  {
    const char *path = "sample.wav";
    int x_length = GetAudioLength(path);
    return x_length;
  }
  EMSCRIPTEN_KEEPALIVE int _wavread(int x_length)
  {
    if (x_length < 1)
      return -1;
    const char *path = "sample.wav";
    int fs = 0, nbit = 0;
    auto x = Float64Array::create(x_length > 2 ? x_length : 2);
    wavread(path, &fs, &nbit, x->ptr);
    if (fs > 0)
    {
      x->write(0, x_length);
      x->ptr[0] = fs;
      x->ptr[1] = nbit;
      x->write(1, 2);
    }
    return fs;
  }
  EMSCRIPTEN_KEEPALIVE int _wavwrite(int x_length, int fs)
  {
    if (x_length < 1 || fs < 1)
      return -1;
    const char *path = "sample.wav";
    auto x = Float64Array::from(0, x_length);
    wavwrite(x->ptr, x_length, fs, 16, path);
    return 0;
  }

  DioOption dioOption = {0};
  HarvestOption harvestOption = {0};
  CheapTrickOption cheapTrickOption = {0};
  D4COption d4cOption = {0};

  EMSCRIPTEN_KEEPALIVE int _init_world(int fs, double f0_floor, double f0_ceil)
  {
    if (fs < 1)
      return -1;
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

  EMSCRIPTEN_KEEPALIVE int _dio(int x_length, int fs, double frame_period, int withStoneMask)
  {
    if (x_length < 1 || fs < 1 || frame_period < 1)
      return -1;
    auto x = Float64Array::from(0, x_length);
    dioOption.frame_period = frame_period;
    int f0_length = GetSamplesForDIO(fs, x_length, dioOption.frame_period);
    if (f0_length < 1)
      return -1;
    auto t = Float64Array::create(f0_length);
    auto f0 = Float64Array::create(f0_length);
    Dio(x->ptr, x_length, fs, &dioOption, t->ptr, f0->ptr);
    t->write(1);
    if (withStoneMask)
    {
      auto refined_f0 = Float64Array::create(f0_length);
      StoneMask(x->ptr, x_length, fs, t->ptr, f0->ptr, f0_length, refined_f0->ptr);
      refined_f0->write(2);
    }
    else
    {
      f0->write(2);
    }
    return 0;
  }

  EMSCRIPTEN_KEEPALIVE int _harvest(int x_length, int fs, double frame_period, int withStoneMask)
  {
    if (x_length < 1 || fs < 1 || frame_period < 1)
      return -1;
    auto x = Float64Array::from(0, x_length);
    harvestOption.frame_period = frame_period;
    int f0_length = GetSamplesForHarvest(fs, x_length, dioOption.frame_period);
    if (f0_length < 1)
      return -1;
    auto t = Float64Array::create(f0_length);
    auto f0 = Float64Array::create(f0_length);
    Harvest(x->ptr, x_length, fs, &harvestOption, t->ptr, f0->ptr);
    t->write(1);
    if (withStoneMask)
    {
      auto refined_f0 = Float64Array::create(f0_length);
      StoneMask(x->ptr, x_length, fs, t->ptr, f0->ptr, f0_length, refined_f0->ptr);
      refined_f0->write(2);
    }
    else
    {
      f0->write(2);
    }
    return 0;
  }

  EMSCRIPTEN_KEEPALIVE int _stonemask(int x_length, int fs, int f0_length)
  {
    if (x_length < 1 || fs < 1 || f0_length < 1)
      return -1;
    auto x = Float64Array::from(0, x_length);
    auto t = Float64Array::from(1, f0_length);
    auto f0 = Float64Array::from(2, f0_length);
    auto refined_f0 = Float64Array::create(f0_length);
    StoneMask(x->ptr, x_length, fs, t->ptr, f0->ptr, f0_length, refined_f0->ptr);
    refined_f0->write(2);
    return 0;
  }

  EMSCRIPTEN_KEEPALIVE int _cheaptrick(int x_length, int fs, int f0_length)
  {
    if (x_length < 1 || fs < 1 || f0_length < 1)
      return -1;
    auto x = Float64Array::from(0, x_length);
    auto t = Float64Array::from(1, f0_length);
    auto f0 = Float64Array::from(2, f0_length);
    int fft_size = cheapTrickOption.fft_size = GetFFTSizeForCheapTrick(fs, &cheapTrickOption);
    auto spectrogram = Float64Array2D::create(f0_length, fft_size / 2 + 1);
    CheapTrick(x->ptr, x_length, fs, t->ptr, f0->ptr, f0_length, &cheapTrickOption, const_cast<double **>(spectrogram->ptr));
    spectrogram->write(3);
    return fft_size;
  }

  EMSCRIPTEN_KEEPALIVE int _d4c(int x_length, int fs, int f0_length, int fft_size)
  {
    if (x_length < 1 || fs < 1 || f0_length < 1)
      return -1;
    auto x = Float64Array::from(0, x_length);
    auto t = Float64Array::from(1, f0_length);
    auto f0 = Float64Array::from(2, f0_length);
    if (fft_size < 1)
    {
      fft_size = GetFFTSizeForCheapTrick(fs, &cheapTrickOption);
    }
    auto aperiodicity = Float64Array2D::create(f0_length, fft_size / 2 + 1);
    D4C(x->ptr, x_length, fs, t->ptr, f0->ptr, f0_length, fft_size, &d4cOption, const_cast<double **>(aperiodicity->ptr));
    aperiodicity->write(4);
    return 0;
  }

  EMSCRIPTEN_KEEPALIVE int _synthesis(int f0_length, int fft_size, int fs, int frame_period)
  {
    if (f0_length < 1 || fft_size < 1 || fs < 1 || frame_period < 1)
      return -1;
    auto f0 = Float64Array::from(2, f0_length);
    auto spectrogram = Float64Array2D::from(3, f0_length, fft_size / 2 + 1);
    auto aperiodicity = Float64Array2D::from(4, f0_length, fft_size / 2 + 1);
    int y_length = static_cast<int>((f0_length - 1) * frame_period / 1000.0 * fs) + 1;
    auto y = Float64Array::create(y_length);
    Synthesis(f0->ptr, f0_length, spectrogram->ptr, aperiodicity->ptr, fft_size, frame_period, fs, y_length, y->ptr);
    y->write(0);
    return 0;
  }
}