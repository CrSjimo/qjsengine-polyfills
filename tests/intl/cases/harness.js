"use strict";

// Original tests following Test262's assertion, descriptor, coercion and branding patterns.
var intlTests = [];
function test(name, body) {
    if (intlTests.some(function (entry) { return entry.name === name; })) throw new Error("Duplicate test name: " + name);
    intlTests.push({name: name, body: body});
}

function testEach(name, dataSource, body) {
    test(name, body);
    // The fixture expands an ICU string inventory into independent QTest rows.
    intlTests[intlTests.length - 1].data = dataSource;
}

function assert(condition, message) {
    if (!condition) throw new Error(message || "Assertion failed");
}

function describe(value) {
    if (value === null) return "null";
    if (typeof value === "object") return "<object>";
    if (typeof value === "function") return "<function>";
    if (typeof value === "string") return JSON.stringify(value);
    if (Object.is(value, -0)) return "-0";
    return String(value);
}

function same(actual, expected, message) {
    if (Object.is(actual, expected)) return;
    throw new Error((message || "SameValue") + ": got " + describe(actual) + ", expected " + describe(expected));
}

function equal(actual, expected, message) {
    if (Object.is(actual, expected)) return;
    if (actual === null || expected === null || typeof actual !== "object" || typeof expected !== "object") {
        throw new Error(message || "Different values: " + describe(actual) + " / " + describe(expected));
    }
    same(Array.isArray(actual), Array.isArray(expected), message || "Array kind");
    var actualKeys = Object.keys(actual).sort();
    var expectedKeys = Object.keys(expected).sort();
    same(actualKeys.join("|"), expectedKeys.join("|"), message || "Own keys");
    actualKeys.forEach(function (key) { equal(actual[key], expected[key], (message || "Value") + "." + key); });
}

function throws(Type, body) {
    var caught = false;
    try { body(); } catch (error) {
        caught = true;
        if (!(error instanceof Type)) throw new Error("Expected " + Type.name + ", got " + describe(error));
        same(Object.getPrototypeOf(error), Type.prototype, "Exact exception type");
    }
    assert(caught, "Expected " + Type.name + " to be thrown");
}

function abrupt(body) {
    var sentinel = {};
    var caught;
    try { body(sentinel); } catch (error) { caught = error; }
    same(caught, sentinel, "Propagate the original abrupt completion");
}

function dataProperty(object, key, value, writable, configurable) {
    var descriptor = Object.getOwnPropertyDescriptor(object, key);
    assert(descriptor, "Missing own property " + String(key));
    same(descriptor.value, value, "Property value " + String(key));
    same(descriptor.writable, writable === undefined ? true : writable, "Writable " + String(key));
    same(descriptor.enumerable, false, "Enumerable " + String(key));
    same(descriptor.configurable, configurable === undefined ? true : configurable, "Configurable " + String(key));
    assert(!("get" in descriptor) && !("set" in descriptor));
}

function builtin(object, key, length) {
    var fn = object[key];
    same(typeof fn, "function", "Function " + String(key));
    dataProperty(object, key, fn);
    dataProperty(fn, "length", length, false);
    dataProperty(fn, "name", key, false);
    same(Object.getPrototypeOf(fn), Function.prototype);
    same(Object.prototype.hasOwnProperty.call(fn, "prototype"), false);
    throws(TypeError, function () { Reflect.construct(fn, []); });
}

function getter(object, key) {
    var descriptor = Object.getOwnPropertyDescriptor(object, key);
    assert(descriptor, "Missing accessor " + key);
    same(typeof descriptor.get, "function");
    same(descriptor.set, undefined);
    same(descriptor.enumerable, false);
    same(descriptor.configurable, true);
    dataProperty(descriptor.get, "length", 0, false);
    dataProperty(descriptor.get, "name", "get " + key, false);
    same(Object.prototype.hasOwnProperty.call(descriptor.get, "prototype"), false);
    return descriptor.get;
}

function ordinary(object, keys) {
    same(Object.getPrototypeOf(object), Object.prototype);
    if (keys) equal(Object.keys(object), keys);
    Object.keys(object).forEach(function (key) {
        var descriptor = Object.getOwnPropertyDescriptor(object, key);
        same(descriptor.writable, true);
        same(descriptor.enumerable, true);
        same(descriptor.configurable, true);
    });
}

function reference(operation, request) {
    return icuOracle.query(operation, request || {});
}

function joined(parts) {
    return parts.map(function (part) { return part.value; }).join("");
}

function checkParts(parts, text, allowedTypes, range, unit) {
    assert(Array.isArray(parts));
    same(Object.getPrototypeOf(parts), Array.prototype);
    same(joined(parts), text, "Parts concatenate to the formatted result");
    parts.forEach(function (part) {
        ordinary(part);
        equal(Object.keys(part), range ? ["type", "value", "source"] : (unit && part.type !== "literal" ? ["type", "value", "unit"] : ["type", "value"]));
        assert(allowedTypes.indexOf(part.type) !== -1, "Unexpected part " + part.type);
        same(typeof part.value, "string");
        assert(part.value.length > 0);
        if (range) assert(["startRange", "endRange", "shared"].indexOf(part.source) !== -1);
        if (unit && part.type !== "literal") same(typeof part.unit, "string");
    });
}

function construct(name, locales, options) {
    if (name === "DisplayNames" && options === undefined) options = {type: "language"};
    return new Intl[name](locales, options);
}

function rejectsOption(name, property, values, base) {
    values.forEach(function (value, index) {
        test(name + "/invalid-" + property + "/" + index, function () {
            var options = Object.assign({}, base || {});
            options[property] = value;
            throws(RangeError, function () { construct(name, "en", options); });
        });
    });
}

function optionValues(name, property, values, base) {
    values.forEach(function (value) {
        test(name + "/option-" + property + "/" + value, function () {
            var options = Object.assign({}, base || {});
            options[property] = value;
            same(construct(name, "en", options).resolvedOptions()[property], value);
        });
    });
}

var localeInputs = ["en-US", "de-DE", "fr-FR", "ar-EG", "hi-IN", "ja-JP", "zh-Hans-CN"];
var services = ["Collator", "DateTimeFormat", "DisplayNames", "DurationFormat", "ListFormat", "NumberFormat", "PluralRules", "RelativeTimeFormat", "Segmenter"];
var invalidTags = ["", "i", "x", "u", "419", "de_DE", "en-", "-en", "en--US", "de-1996-1996", "en-u-ca-gregory-u-nu-latn", "en-a-foo-a-bar", "en-\u0000", " en", "en ", "it-IT-Latn", "i-klingon", "x-private", "zh-cmn-Hans-CN", "\u4e2d\u6587"];
var numberPartTypes = ["literal", "integer", "group", "decimal", "fraction", "minusSign", "plusSign", "percentSign", "currency", "unit", "nan", "infinity", "compact", "exponentSeparator", "exponentMinusSign", "exponentInteger", "approximatelySign"];
var datePartTypes = ["literal", "era", "year", "relatedYear", "yearName", "month", "day", "weekday", "dayPeriod", "hour", "minute", "second", "fractionalSecond", "timeZoneName", "unknown"];
