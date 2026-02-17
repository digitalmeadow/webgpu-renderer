export declare class Vec4 {
    readonly data: Float32Array;
    constructor(x?: number, y?: number, z?: number, w?: number);
    get x(): number;
    set x(value: number);
    get y(): number;
    set y(value: number);
    get z(): number;
    set z(value: number);
    get w(): number;
    set w(value: number);
    set(x: number, y: number, z: number, w: number): this;
    copy(): Vec4;
    clone(): Vec4;
    static create(x?: number, y?: number, z?: number, w?: number): Vec4;
    static add(a: Vec4, b: Vec4, out?: Vec4): Vec4;
    static sub(a: Vec4, b: Vec4, out?: Vec4): Vec4;
    static scale(a: Vec4, s: number, out?: Vec4): Vec4;
    static dot(a: Vec4, b: Vec4): number;
    static len(a: Vec4): number;
    static lengthSquared(a: Vec4): number;
    static normalize(a: Vec4, out?: Vec4): Vec4;
    static distance(a: Vec4, b: Vec4): number;
    static lerp(a: Vec4, b: Vec4, t: number, out?: Vec4): Vec4;
    static negate(a: Vec4, out?: Vec4): Vec4;
    static equals(a: Vec4, b: Vec4, epsilon?: number): boolean;
}
//# sourceMappingURL=vec4.d.ts.map