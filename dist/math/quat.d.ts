import { Vec3 } from "./vec3";
export declare class Quat {
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
    copy(): Quat;
    clone(): Quat;
    static identity(): Quat;
    static create(x?: number, y?: number, z?: number, w?: number): Quat;
    static zero(): Quat;
    static copy(a: Quat, out?: Quat): Quat;
    static fromAxisAngle(axis: Vec3, rad: number): Quat;
    static toAxisAngle(q: Quat): {
        angle: number;
        axis: Vec3;
    };
    static multiply(a: Quat, b: Quat, out?: Quat): Quat;
    static slerp(a: Quat, b: Quat, t: number, out?: Quat): Quat;
    static len(a: Quat): number;
    static lengthSquared(a: Quat): number;
    static normalize(a: Quat, out?: Quat): Quat;
    static invert(a: Quat, out?: Quat): Quat;
    static conjugate(a: Quat, out?: Quat): Quat;
    static fromEuler(x: number, y: number, z: number, out?: Quat): Quat;
    static fromEulerOrder(x: number, y: number, z: number, order: "xyz" | "xzy" | "yxz" | "yzx" | "zxy" | "zyx", out?: Quat): Quat;
    static fromMat(m: import("./mat4").Mat4, out?: Quat): Quat;
    static dot(a: Quat, b: Quat): number;
    static add(a: Quat, b: Quat, out?: Quat): Quat;
    static sub(a: Quat, b: Quat, out?: Quat): Quat;
    static scale(a: Quat, s: number, out?: Quat): Quat;
    static lerp(a: Quat, b: Quat, t: number, out?: Quat): Quat;
    static angle(a: Quat, b: Quat): number;
    static rotateX(q: Quat, rad: number, out?: Quat): Quat;
    static rotateY(q: Quat, rad: number, out?: Quat): Quat;
    static rotateZ(q: Quat, rad: number, out?: Quat): Quat;
    static rotationTo(a: Vec3, b: Vec3, out?: Quat): Quat;
    static sqlerp(a: Quat, b: Quat, c: Quat, d: Quat, t: number, out?: Quat): Quat;
    static equals(a: Quat, b: Quat, epsilon?: number): boolean;
}
//# sourceMappingURL=quat.d.ts.map