
#ifdef __INNER__
#include __INNER__
#else
#include <errno.h>
#include <string.h>
#include <unistd.h>
extern "C"
{
  // zig/lib/libc/wasi/libc-bottom-half/sources/posix.c
  int __wasilibc_open_nomode(const char *path, int oflag)
  {
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
}
#endif
