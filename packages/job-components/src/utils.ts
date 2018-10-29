/** A simplified implemation of lodash isString */
export function isString(val: any): val is string {
    return typeof val === 'string';
}

/** A simplified implemation of lodash isInteger */
export function isInteger(val: any): val is number {
    if (typeof val !== 'number') return false;

    return Number.isInteger(val);
}

export function isObject(input: any): input is object {
    return input && typeof input === 'object';
}

export function isFunction(input: any): input is Function {
    return input && typeof input === 'function';
}

/**
 * Perform a shallow clone of an object to another, in the fastest way possible
*/
export function fastAssign<T, U>(target: T, source: U) {
    if (!isObject(target) || !isObject(source)) {
        return target;
    }

    const keys = Object.keys(source);
    const totalKeys = keys.length;
    let key;

    for (let i = 0; i < totalKeys; i++) {
        key = keys[i];
        target[key] = source[key];
    }

    return target;
}

/**
 * Map an array faster without sparse array handling
*/
export function fastMap<T>(arr: T[], fn: (val: T, index: number) => T): T[] {
    const length = arr.length;
    const result = Array(length);

    for (let i = 0; i < length; i++) {
        result[i] = fn(arr[i], i);
    }

    return result;
}

/** A native implemation of lodash random */
export function random(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** A native implemation of lodash uniq */
export function uniq<T>(arr: T[]): T[] {
    return [...new Set(arr)];
}

/** A native implemation of lodash times */ /** A native implemation of lodash times */
export function times(n: number, fn: (index: number) => any) {
    let i = -1;
    const result = Array(n);

    while (++i < n) {
        result[i] = fn(i);
    }
    return result;
}

/** A native implemation of lodash startsWith */
export function startsWith(str: string, val: string) {
    if (typeof str !== 'string') return false;
    return str.startsWith(val);
}

/** A simplified implemation of moment(new Date(val)).isValid() */
export function isValidDate(val: any): boolean {
    const d = new Date(val);
    // @ts-ignore
    return d instanceof Date && !isNaN(d);
}

/** A native implemation of lodash flatten */
export function flatten<T>(val: Many<T[]>): T[] {
    return val.reduce((a, b) => a.concat(b), []);
}

/** A simple definitions of array */
interface Many<T> extends Array<T> {
}

/** A decorator for locking down a property or method */
export function locked() {
    // @ts-ignore
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        descriptor.configurable = false;
        descriptor.enumerable = false;
        descriptor.writable = false;
    };
}

/** A decorator for making a property, or method enumerable */
export function enumerable(enabled: boolean) {
    // @ts-ignore
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        descriptor.enumerable = enabled;
    };
}

interface PromiseFn {
    (input: any): Promise<any>;
}

/**
 * Async waterfall function
 */
export function waterfall(input: any, fns: PromiseFn[]): Promise<any> {
    return fns.reduce(async (last, fn) => {
        return fn(await last);
    }, input);
}
