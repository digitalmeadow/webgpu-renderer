import { Vec3 } from "./vec3";
import { Quat } from "./quat";
export declare class Mat4 {
    readonly data: Float32Array;
    constructor();
    static identity(): Mat4;
    static create(): Mat4;
    static copy(m: Mat4, out?: Mat4): Mat4;
    static clone(m: Mat4): Mat4;
    static multiply(a: Mat4, b: Mat4, out?: Mat4): Mat4;
    static invert(m: Mat4, out?: Mat4): Mat4 | null;
    static determinant(m: Mat4): number;
    static transpose(m: Mat4, out?: Mat4): Mat4;
    static translate(m: Mat4, v: Vec3, out?: Mat4): Mat4;
    static scale(m: Mat4, v: Vec3, out?: Mat4): Mat4;
    static rotate(m: Mat4, rad: number, axis: Vec3, out?: Mat4): Mat4 | null;
    static rotateX(m: Mat4, rad: number, out?: Mat4): Mat4;
    static rotateY(m: Mat4, rad: number, out?: Mat4): Mat4;
    static rotateZ(m: Mat4, rad: number, out?: Mat4): Mat4;
    static fromQuat(q: Quat, out?: Mat4): Mat4;
    static fromRotationTranslationScale(q: Quat, v: Vec3, s: Vec3, out?: Mat4): Mat4;
    static fromRotationTranslationScaleOrigin(q: Quat, v: Vec3, s: Vec3, o: Vec3, out?: Mat4): Mat4;
    static getTranslation(m: Mat4, out?: Vec3): Vec3;
    static getRotation(m: Mat4, out?: Quat): Quat;
    static getScaling(m: Mat4, out?: Vec3): Vec3;
    static perspective(fovY: number, aspect: number, near: number, far: number, out?: Mat4): Mat4;
    static ortho(left: number, right: number, bottom: number, top: number, near: number, far: number, out?: Mat4): Mat4;
    static lookAt(eye: Vec3, center: Vec3, up: Vec3, out?: Mat4): Mat4;
}
//# sourceMappingURL=mat4.d.ts.map