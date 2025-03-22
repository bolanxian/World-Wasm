const std = @import("std");
const Allocator = std.mem.Allocator;
const Fd = enum(usize) {
    x = 0,
    time_axis = 1,
    f0 = 2,
    spectrogram = 3,
    aperiodicity = 4,
    _,
};
const Env = struct {
    extern "env" fn readFloat64Array(fd: Fd, ptr: [*]f64, length: usize) void;
    extern "env" fn writeFloat64Array(fd: Fd, ptr: [*]f64, length: usize) void;
    extern "env" fn readFloat64Array2D(fd: Fd, ptr: [*]const [*]f64, width: usize, height: usize) void;
    extern "env" fn writeFloat64Array2D(fd: Fd, ptr: [*]const [*]f64, width: usize, height: usize) void;
};
const Float64Array = struct {
    const Self = @This();
    data: []f64,
    inline fn init(allocator: Allocator, length: usize) !Self {
        return Self{ .data = try allocator.alloc(f64, length) };
    }
    inline fn from(allocator: Allocator, length: usize, fd: Fd) !Self {
        const array = try init(allocator, length);
        Env.readFloat64Array(fd, array.data.ptr, length);
        return array;
    }
    inline fn read(self: Self, fd: Fd) void {
        Env.readFloat64Array(fd, self.data.ptr, self.data.len);
    }
    inline fn write(self: Self, fd: Fd) void {
        Env.writeFloat64Array(fd, self.data.ptr, self.data.len);
    }
    inline fn writeLength(self: Self, fd: Fd, length: usize) void {
        Env.writeFloat64Array(fd, self.data.ptr, length);
    }
    inline fn deinit(self: Self, allocator: Allocator) void {
        allocator.free(self.data);
    }
};
const Float64Array2D = struct {
    const Self = @This();
    data: []const []f64,
    ptrs: []const [*]f64,
    width: usize,
    height: usize,
    inline fn init(allocator: Allocator, width: usize, height: usize) !Self {
        const data = try allocator.alloc([]f64, width);
        errdefer allocator.free(data);
        const ptrs = try allocator.alloc([*]f64, width);
        errdefer allocator.free(ptrs);
        var i: usize = undefined;
        errdefer for (data[0..i]) |value| {
            allocator.free(value);
        };
        for (data, ptrs, 0..) |*value, *ptr, num| {
            i = num;
            value.* = try allocator.alloc(f64, height);
            ptr.* = value.ptr;
        }
        return Self{
            .data = data,
            .ptrs = ptrs,
            .width = width,
            .height = height,
        };
    }
    inline fn from(allocator: Allocator, width: usize, height: usize, fd: Fd) !Self {
        const self = try init(allocator, width, height);
        Env.readFloat64Array2D(fd, self.ptrs.ptr, self.width, self.height);
        return self;
    }
    inline fn read(self: Self, fd: Fd) void {
        Env.readFloat64Array2D(fd, self.ptrs.ptr, self.width, self.height);
    }
    inline fn write(self: Self, fd: Fd) void {
        Env.writeFloat64Array2D(fd, self.ptrs.ptr, self.width, self.height);
    }
    inline fn deinit(self: Self, allocator: Allocator) void {
        for (self.data) |value| {
            allocator.free(value);
        }
        allocator.free(self.data);
    }
};
const World = @cImport({
    for (.{
        "matlabfunctions",
        "common",
        "fft",
        "dio",
        "harvest",
        "stonemask",
        "cheaptrick",
        "d4c",
        "synthesis",
    }) |name| {
        @cInclude("world/" ++ name ++ ".h");
    }
    @cInclude("tools/" ++ "audioio.h");
});

const Dio: fn (
    x: [*c]const f64,
    x_length: c_int,
    fs: c_int,
    option: [*c]const World.DioOption,
    temporal_positions: [*c]f64,
    f0: [*c]f64,
) callconv(.c) void = World.Dio;
const InitializeDioOption: fn (option: [*c]World.DioOption) callconv(.c) void = World.InitializeDioOption;
const GetSamplesForDIO: fn (fs: c_int, x_length: c_int, frame_period: f64) callconv(.c) c_int = World.GetSamplesForDIO;

const Harvest: fn (
    x: [*c]const f64,
    x_length: c_int,
    fs: c_int,
    option: [*c]const World.HarvestOption,
    temporal_positions: [*c]f64,
    f0: [*c]f64,
) callconv(.c) void = World.Harvest;
const InitializeHarvestOption: fn (option: [*c]World.HarvestOption) callconv(.c) void = World.InitializeHarvestOption;
const GetSamplesForHarvest: fn (fs: c_int, x_length: c_int, frame_period: f64) callconv(.c) c_int = World.GetSamplesForHarvest;

const StoneMask: fn (
    x: [*c]const f64,
    x_length: c_int,
    fs: c_int,
    temporal_positions: [*c]const f64,
    f0: [*c]const f64,
    f0_length: c_int,
    refined_f0: [*c]f64,
) callconv(.c) void = World.StoneMask;

const CheapTrick: fn (
    x: [*c]const f64,
    x_length: c_int,
    fs: c_int,
    temporal_positions: [*c]const f64,
    f0: [*c]const f64,
    f0_length: c_int,
    option: [*c]const World.CheapTrickOption,
    spectrogram: [*c][*c]f64,
) callconv(.c) void = World.CheapTrick;
const InitializeCheapTrickOption: fn (fs: c_int, option: [*c]World.CheapTrickOption) callconv(.c) void = World.InitializeCheapTrickOption;
const GetFFTSizeForCheapTrick: fn (fs: c_int, option: [*c]const World.CheapTrickOption) callconv(.c) c_int = World.GetFFTSizeForCheapTrick;
const GetF0FloorForCheapTrick: fn (fs: c_int, fft_size: c_int) callconv(.c) f64 = World.GetF0FloorForCheapTrick;

const D4C: fn (
    x: [*c]const f64,
    x_length: c_int,
    fs: c_int,
    temporal_positions: [*c]const f64,
    f0: [*c]const f64,
    f0_length: c_int,
    fft_size: c_int,
    option: [*c]const World.D4COption,
    aperiodicity: [*c][*c]f64,
) callconv(.c) void = World.D4C;
const InitializeD4COption: fn (option: [*c]World.D4COption) callconv(.c) void = World.InitializeD4COption;

const Synthesis: fn (
    f0: [*c]const f64,
    f0_length: c_int,
    spectrogram: [*c]const [*c]const f64,
    aperiodicity: [*c]const [*c]const f64,
    fft_size: c_int,
    frame_period: f64,
    fs: c_int,
    y_length: c_int,
    y: [*c]f64,
) callconv(.c) void = World.Synthesis;

const wavwrite: fn (x: [*c]const f64, x_length: c_int, fs: c_int, nbit: c_int, filename: [*c]const u8) callconv(.c) void = World.wavwrite;
const GetAudioLength: fn (filename: [*c]const u8) callconv(.c) c_int = World.GetAudioLength;
const wavread: fn (filename: [*c]const u8, fs: [*c]c_int, nbit: [*c]c_int, x: [*c]f64) callconv(.c) void = World.wavread;

const Wasm = struct {
    const builtin = @import("builtin");
    const allocator = std.heap.c_allocator;
    const stdout = std.io.getStdOut().writer();
    const endian = @tagName(builtin.cpu.arch.endian());
    inline fn _get_info_inner() !void {
        try stdout.writeAll("[World-Wasm]\n");
        try stdout.writeAll("World Vocoder for WebAssembly\n");
        try stdout.writeAll("Zig " ++ builtin.zig_version_string ++ "\n");
        try stdout.writeAll(World.__VERSION__ ++ "\n");
        try stdout.writeAll(endian ++ " endian\n");
        inline for ([_]struct { []const u8, type }{
            .{ "f80", f80 },
            .{ "void *", *anyopaque },
            .{ "char", c_char },
            .{ "short", c_short },
            .{ "int", c_int },
            .{ "long", c_long },
            .{ "long long", c_longlong },
            .{ "long double", c_longdouble },
            .{ "DioOption", World.DioOption },
            .{ "HarvestOption", World.HarvestOption },
            .{ "CheapTrickOption", World.CheapTrickOption },
            .{ "D4COption", World.D4COption },
            .{ "Float64Array", Float64Array },
            .{ "Float64Array2D", Float64Array2D },
        }) |v| {
            const a, const b, const c = .{ v.@"0", @sizeOf(v.@"1"), @bitSizeOf(v.@"1") / 8 };
            if (comptime b == c) {
                try stdout.print("sizeof({s}) = {}\n", .{ a, b });
            } else {
                try stdout.print("sizeof({s}) = {}({})\n", .{ a, b, c });
            }
        }
    }
    export fn _get_info() c_int {
        _get_info_inner() catch return -1;
        return 0;
    }
    export fn _destruct(ptr: *anyopaque) void {
        _ = ptr;
    }
    const path = "sample.wav";
    export fn _wavreadlength() c_int {
        const x_length = GetAudioLength(path);
        return x_length;
    }
    export fn _wavread(x_length: c_int) isize {
        if (x_length < 1)
            return -1;
        var fs: c_int = 0;
        var nbit: c_int = 0;
        const x = Float64Array.init(allocator, if (x_length > 2) @bitCast(x_length) else 2) catch return -2;
        defer x.deinit(allocator);
        wavread(path, &fs, &nbit, x.data.ptr);
        if (fs > 0) {
            x.writeLength(.x, @bitCast(x_length));
            x.data.ptr[0] = @floatFromInt(fs);
            x.data.ptr[1] = @floatFromInt(nbit);
            x.writeLength(@enumFromInt(1), 2);
        }
        return fs;
    }
    export fn _wavwrite(x_length: c_int, fs: c_int) isize {
        if (x_length < 1 or fs < 1)
            return -1;
        const x = Float64Array.from(allocator, @bitCast(x_length), .x) catch return -2;
        defer x.deinit(allocator);
        wavwrite(x.data.ptr, x_length, fs, 16, path);
        return 0;
    }

    var dioOption: World.DioOption = undefined;
    var harvestOption: World.HarvestOption = undefined;
    var cheapTrickOption: World.CheapTrickOption = undefined;
    var d4cOption: World.D4COption = undefined;

    export fn _init_world(fs: c_int, f0_floor: f64, f0_ceil: f64) c_int {
        if (fs < 1)
            return -1;
        InitializeDioOption(&dioOption);
        InitializeHarvestOption(&harvestOption);
        InitializeCheapTrickOption(fs, &cheapTrickOption);
        InitializeD4COption(&d4cOption);
        if (f0_floor > 0) {
            dioOption.f0_floor = f0_floor;
            harvestOption.f0_floor = f0_floor;
            cheapTrickOption.f0_floor = f0_floor;
            cheapTrickOption.fft_size = GetFFTSizeForCheapTrick(fs, &cheapTrickOption);
        }
        if (f0_ceil > 0) {
            dioOption.f0_ceil = f0_ceil;
            harvestOption.f0_ceil = f0_ceil;
        }
        return cheapTrickOption.fft_size;
    }

    export fn _dio(x_length: usize, fs: c_int, frame_period: f64, withStoneMask: c_int) c_int {
        return @call(.always_inline, @"F0 estimation method", .{ .Dio, x_length, fs, frame_period, withStoneMask != 0 });
    }
    export fn _harvest(x_length: usize, fs: c_int, frame_period: f64, withStoneMask: c_int) c_int {
        return @call(.always_inline, @"F0 estimation method", .{ .Harvest, x_length, fs, frame_period, withStoneMask != 0 });
    }
    fn @"F0 estimation method"(comptime method: enum { Dio, Harvest }, x_length: usize, fs: c_int, frame_period: f64, withStoneMask: bool) c_int {
        if (x_length < 1 or fs < 1 or frame_period < 1)
            return -1;
        const x = Float64Array.from(allocator, x_length, .x) catch return -2;
        defer x.deinit(allocator);
        var f0_len: usize = 0;
        switch (method) {
            .Dio => {
                dioOption.frame_period = frame_period;
                f0_len = @bitCast(GetSamplesForDIO(fs, @bitCast(x_length), dioOption.frame_period));
            },
            .Harvest => {
                harvestOption.frame_period = frame_period;
                f0_len = @bitCast(GetSamplesForHarvest(fs, @bitCast(x_length), harvestOption.frame_period));
            },
        }
        if (f0_len < 1)
            return -1;
        const t = Float64Array.init(allocator, f0_len) catch return -2;
        defer t.deinit(allocator);
        const f0 = Float64Array.init(allocator, f0_len) catch return -2;
        defer f0.deinit(allocator);
        switch (method) {
            .Dio => {
                Dio(x.data.ptr, @bitCast(x.data.len), fs, &dioOption, t.data.ptr, f0.data.ptr);
            },
            .Harvest => {
                Harvest(x.data.ptr, @bitCast(x.data.len), fs, &harvestOption, t.data.ptr, f0.data.ptr);
            },
        }
        t.write(.time_axis);
        if (withStoneMask) {
            const refined_f0 = Float64Array.init(allocator, f0_len) catch return -2;
            defer refined_f0.deinit(allocator);
            StoneMask(x.data.ptr, @bitCast(x.data.len), fs, t.data.ptr, f0.data.ptr, @bitCast(f0.data.len), refined_f0.data.ptr);
            refined_f0.write(.f0);
        } else {
            f0.write(.f0);
        }
        return 0;
    }
    export fn _stonemask(x_length: usize, fs: c_int, f0_length: usize) c_int {
        if (x_length < 1 or fs < 1 or f0_length < 1)
            return -1;
        const x = Float64Array.from(allocator, x_length, .x) catch return -1;
        defer x.deinit(allocator);
        const t = Float64Array.from(allocator, f0_length, .time_axis) catch return -1;
        defer t.deinit(allocator);
        const f0 = Float64Array.from(allocator, f0_length, .f0) catch return -1;
        defer f0.deinit(allocator);
        const refined_f0 = Float64Array.init(allocator, f0_length) catch return -1;
        defer refined_f0.deinit(allocator);
        StoneMask(x.data.ptr, @bitCast(x_length), fs, t.data.ptr, f0.data.ptr, @bitCast(f0_length), refined_f0.data.ptr);
        refined_f0.write(.f0);
        return 0;
    }
    export fn _cheaptrick(x_length: usize, fs: c_int, f0_length: usize) isize {
        if (x_length < 1 or fs < 1 or f0_length < 1)
            return -1;
        const x = Float64Array.from(allocator, x_length, .x) catch return -1;
        defer x.deinit(allocator);
        const t = Float64Array.from(allocator, f0_length, .time_axis) catch return -1;
        defer t.deinit(allocator);
        const f0 = Float64Array.from(allocator, f0_length, .f0) catch return -1;
        defer f0.deinit(allocator);
        const fft_size: usize = @bitCast(GetFFTSizeForCheapTrick(fs, &cheapTrickOption));
        cheapTrickOption.fft_size = @bitCast(fft_size);
        const spectrogram = Float64Array2D.init(allocator, f0_length, @divTrunc(fft_size, 2) + 1) catch return -1;
        defer spectrogram.deinit(allocator);
        CheapTrick(
            x.data.ptr,
            @bitCast(x_length),
            fs,
            t.data.ptr,
            f0.data.ptr,
            @bitCast(f0_length),
            &cheapTrickOption,
            @constCast(@ptrCast(spectrogram.ptrs.ptr)),
        );
        spectrogram.write(.spectrogram);
        return @bitCast(fft_size);
    }
    export fn _d4c(x_length: usize, fs: c_int, f0_length: usize, _fft_size: usize) c_int {
        if (x_length < 1 or fs < 1 or f0_length < 1)
            return -1;
        const x = Float64Array.from(allocator, x_length, .x) catch return -1;
        defer x.deinit(allocator);
        const t = Float64Array.from(allocator, f0_length, .time_axis) catch return -1;
        defer t.deinit(allocator);
        const f0 = Float64Array.from(allocator, f0_length, .f0) catch return -1;
        defer f0.deinit(allocator);
        var fft_size: usize = _fft_size;
        if (fft_size < 1) {
            fft_size = @bitCast(GetFFTSizeForCheapTrick(fs, &cheapTrickOption));
        }
        const aperiodicity = Float64Array2D.init(allocator, f0_length, @divTrunc(fft_size, 2) + 1) catch return -1;
        defer aperiodicity.deinit(allocator);
        D4C(
            x.data.ptr,
            @bitCast(x_length),
            fs,
            t.data.ptr,
            f0.data.ptr,
            @bitCast(f0_length),
            @bitCast(fft_size),
            &d4cOption,
            @constCast(@ptrCast(aperiodicity.ptrs.ptr)),
        );
        aperiodicity.write(.aperiodicity);
        return 0;
    }
    export fn _synthesis(f0_length: usize, fft_size: usize, fs: c_int, frame_period: f64) c_int {
        if (f0_length < 1 or fft_size < 1 or fs < 1 or frame_period < 1)
            return -1;
        const f0 = Float64Array.from(allocator, f0_length, .f0) catch return -1;
        defer f0.deinit(allocator);
        const spectrogram = Float64Array2D.from(allocator, f0_length, @divTrunc(fft_size, 2) + 1, .spectrogram) catch return -1;
        defer spectrogram.deinit(allocator);
        const aperiodicity = Float64Array2D.from(allocator, f0_length, @divTrunc(fft_size, 2) + 1, .aperiodicity) catch return -1;
        defer aperiodicity.deinit(allocator);
        const y_length = @as(usize, @intFromFloat(@as(f64, @floatFromInt(f0_length - 1)) * frame_period / 1000.0 * @as(f64, @floatFromInt(fs)))) + 1;
        const y = Float64Array.init(allocator, y_length) catch return -1;
        defer y.deinit(allocator);
        Synthesis(
            f0.data.ptr,
            @bitCast(f0_length),
            spectrogram.ptrs.ptr,
            aperiodicity.ptrs.ptr,
            @bitCast(fft_size),
            frame_period,
            fs,
            @bitCast(y_length),
            y.data.ptr,
        );
        y.write(.x);
        return 0;
    }
};

comptime {
    _ = Wasm;
}
