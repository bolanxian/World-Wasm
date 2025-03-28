
const types = Object.freeze({
  int8: Int8Array, uint8: Uint8Array, int16: Int16Array, uint16: Uint16Array,
  int32: Int32Array, uint32: Uint32Array, int64: BigInt64Array, uint64: BigUint64Array,
  float32: Float32Array, float64: Float64Array, uint8Clamped: Uint8ClampedArray
})
export type Types = keyof typeof types
export type TypedArrayConstructor<T extends Types = Types> = typeof types[T]
export type TypedArray<T extends Types = Types> = InstanceType<TypedArrayConstructor<T>>
export type TypedArrayValue<T extends Types = Types> = TypedArray<T>[number]
export const TypedArray = Object.getPrototypeOf(Uint8Array) as TypedArrayConstructor
const typedArray = TypedArray.prototype

type __TypeNdarray<N extends number, T extends TypedArray, A extends unknown[], K>
  = A['length'] extends N ? K : __TypeNdarray<N, T, [...A, number], Readonly<Ndarray & Array<K> & {
    buffer: T
    shape: Readonly<[...A, number]>
    ndim: N
  }>>
type _TypeNdarray<N extends number, T extends TypedArray = TypedArray> = __TypeNdarray<N, T, [number], T>
export type TypeNdarray<N extends number, T extends Types = Types> = _TypeNdarray<N, TypedArray<T>>
export type NdarrayPacked = {
  shape: number[],
  dtype: Types,
  buffer: TypedArray<'uint8'>
}
export const isTypedArrayConstructor = (value: any): value is TypedArrayConstructor => Object.getPrototypeOf(value) === TypedArray
export const isTypedArray = (value: any): value is TypedArray => value instanceof TypedArray
const typeToCtor = new Map<Types, TypedArrayConstructor>()
const ctorToType = new Map<TypedArrayConstructor, Types>()
export const hasType = (value: any): value is Types => typeToCtor.has(value)
for (const [name, Ctor] of Object.entries(types) as [Types, TypedArrayConstructor][]) {
  ctorToType.set(Ctor, name)
  typeToCtor.set(name, Ctor)
}

const { call } = Function.prototype, mul = (a: number, b: number): number => a * b
const _subarray = call.bind(typedArray.subarray) as <T extends TypedArray>(thisArg: T, begin?: number, end?: number) => T
export class Ndarray extends Array<unknown> {
  static isNdarray<N extends number, T extends Types>(
    ndarray: any, ndim: N, dtype?: T
  ): ndarray is TypeNdarray<N, T> {
    if (ndarray instanceof Ndarray) {
      if (dtype == null) { return ndarray.ndim === ndim }
      return ndarray.ndim === ndim && ndarray.buffer instanceof types[dtype]
    }
    if (ndarray instanceof TypedArray) {
      if (dtype == null) { return ndim === 1 }
      return ndim === 1 && ndarray instanceof types[dtype]
    }
    return false
  }
  static *xreshape(buffer: TypedArray, shape: number[], offset: number): Generator<TypedArray | Ndarray> {
    const next = shape.slice(1), nextLen = next.reduce(mul, 1), len = shape[0]
    let i = 0
    for (; i < len && offset < buffer.length; i++, offset += nextLen) {
      yield this._reshape(buffer, next, offset)
    }
  }
  static _reshape(buffer: TypedArray, shape: number[], offset: number): TypedArray | Ndarray {
    if (shape.length > 1) {
      const array = Ndarray.from(Ndarray.xreshape(buffer, shape, offset)) as any
      array.buffer = buffer
      array.shape = Object.freeze(shape)
      array.offset = offset
      return Object.freeze<Ndarray>(array as Ndarray)
    } else if (offset === 0 && shape[0] === buffer.length) {
      return buffer
    } else {
      return _subarray(buffer, offset, offset + shape[0])
    }
  }
  static create<T extends TypedArrayConstructor, A extends number[]>(value: T, shape: [...A], offset?: number): _TypeNdarray<A['length'], InstanceType<T>>
  static create<T extends TypedArray, A extends number[]>(value: T, shape: [...A], offset?: number): _TypeNdarray<A['length'], T>
  static create<T extends Types, A extends number[]>(value: T, shape: [...A], offset?: number): TypeNdarray<A['length'], T>
  static create(value: TypedArray | TypedArrayConstructor | Types, shape: string | number | number[], offset?: number): TypedArray | Ndarray
  static create(value: TypedArray | TypedArrayConstructor | Types, shape: string | number | number[], offset = 0): TypedArray | Ndarray {
    if (typeof shape === 'string') {
      shape = shape.split(',').map(Number)
    } else if (typeof shape === 'number') {
      shape = [shape]
    }
    let Ctor: TypedArrayConstructor, buffer: TypedArray
    if (hasType(value)) {
      Ctor = types[value]
      buffer = new Ctor(shape.reduce(mul, 1))
      offset = 0
    } else if (isTypedArray(value)) {
      buffer = value
    } else {
      Ctor = value
      buffer = new Ctor(shape.reduce(mul, 1))
      offset = 0
    }
    return this._reshape(buffer, shape, offset)
  }

  declare readonly buffer: TypedArray
  declare readonly shape: readonly number[]
  declare readonly offset: number

  constructor(n: number) {
    super(n)
  }
  get ndim() {
    return this.shape.length
  }
  slice(begin: number = 0, end: number = this.length): this {
    return Ndarray.unpack<this>(Ndarray.pack(this.subarray(begin, end)))
  }
  subarray(begin: number = 0, end: number = this.length): this {
    if (begin < 0) { begin += this.length }
    let array = super.slice(begin, end) as any
    array.buffer = this.buffer
    let shape = this.shape.slice()
    shape[0] = array.length
    array.shape = Object.freeze(shape)
    array.offset = this.offset + begin * shape.slice(1).reduce(mul, 1)
    return Object.freeze(array as this)
  }
  reshape(shape: number | number[]): TypedArray | Ndarray {
    if (arguments.length > 1) {
      shape = [...arguments] as number[]
    }
    return Ndarray.create(this.buffer, shape, this.offset)
  }
  toBuffer() {
    const { buffer, shape, offset } = this
    const length = shape.reduce(mul)
    if (offset === 0 && length === buffer.length) {
      return buffer
    }
    return _subarray(buffer, offset, offset + length)
  }

  static pack(value: Ndarray | TypedArray): NdarrayPacked {
    let array, shape
    if (isTypedArray(value)) {
      array = value
      shape = [array.length]
    } else {
      array = value.toBuffer()
      shape = value.shape.slice()
    }
    const { buffer, byteOffset, byteLength, constructor: Ctor } = array
    return {
      shape, dtype: ctorToType.get(Ctor as TypedArrayConstructor)!,
      buffer: new Uint8Array(buffer, byteOffset, byteLength)
    }
  }
  static unpack<T extends Ndarray | TypedArray>(array: NdarrayPacked): T {
    const { buffer, shape, dtype } = array
    const { byteOffset, byteLength } = buffer
    const Ctor = typeToCtor.get(dtype)!
    return this.create(new Ctor(buffer.buffer.slice(byteOffset, byteOffset + byteLength)), shape) as T
  }
}
Object.assign(Ndarray.prototype, {
  [Symbol.toStringTag]: Ndarray.name
})