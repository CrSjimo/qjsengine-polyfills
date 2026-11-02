"use strict";

function assertNativeTree(value) {
    if (value === null || typeof value !== "object") return;
    if (Array.isArray(value)) {
        same(Object.getPrototypeOf(value), Array.prototype);
        value.forEach(assertNativeTree);
    } else {
        ordinary(value);
        Object.keys(value).forEach(function (key) { assertNativeTree(value[key]); });
    }
}

test("oracle/native-string-arrays", function () {
    ["calendar", "collation", "currency", "numberingSystem", "timeZone", "unit"].forEach(function (key) {
        var values = reference("supportedValues", {key: key});
        same(Array.isArray(values), true, key);
        assertNativeTree(values);
        values.forEach(function (value) { same(typeof value, "string"); });
    });
    var supported = reference("supportedLocales", {service: "NumberFormat", locales: ["en", "de"]});
    same(Array.isArray(supported), true);
    assertNativeTree(supported);
    var categories = reference("plural", {locale: "en", categories: true});
    same(Array.isArray(categories), true);
    assertNativeTree(categories);
});

test("oracle/native-nested-arrays-and-objects", function () {
    var number = reference("number", {locale: "en", value: -1234.5});
    same(Array.isArray(number.parts), true);
    assertNativeTree(number);
    same(typeof number.text, "string");
    var empty = reference("list", {locale: "en", items: []});
    equal(empty.parts, []);
    assertNativeTree(empty);
    var segments = reference("segments", {locale: "en", granularity: "word", input: "A B"});
    same(Array.isArray(segments), true);
    assertNativeTree(segments);
    same(typeof segments[0].index, "number");
    same(typeof segments[0].isWordLike, "boolean");
    var info = reference("localeInfo", {tag: "en-US"});
    ["calendars", "collations", "numberingSystems", "timeZones"].forEach(function (key) { same(Array.isArray(info[key]), true, key); });
    same(Array.isArray(info.weekInfo.weekend), true);
    same(typeof info.weekInfo.firstDay, "number");
    assertNativeTree(info);
});

test("oracle/detached-results-and-special-number-inputs", function () {
    var first = reference("number", {locale: "en", value: 1234.5});
    var second = reference("number", {locale: "en", value: 1234.5});
    assert(first !== second && first.parts !== second.parts && first.parts[0] !== second.parts[0]);
    first.parts[0].value = "changed";
    first.parts.pop();
    equal(reference("number", {locale: "en", value: 1234.5}), second);
    same(reference("number", {locale: "en", value: -0}).parts.some(function (part) { return part.type === "minusSign"; }), true);
    same(reference("number", {locale: "en", value: 0}).parts.some(function (part) { return part.type === "minusSign"; }), false);
    same(reference("number", {locale: "en", value: NaN}).parts.some(function (part) { return part.type === "nan"; }), true);
    same(reference("number", {locale: "en", value: Infinity}).parts.some(function (part) { return part.type === "infinity"; }), true);
});

test("oracle/absent-and-present-keywords", function () {
    ["en", "en-u-ca-buddhist", "en-US-x-private"].forEach(function (tag) {
        var properties = reference("localeProperties", {tag: tag});
        ["collation", "firstDayOfWeek", "hourCycle", "caseFirst", "numberingSystem"].forEach(function (key) { same(properties[key], undefined, tag + "/" + key); });
        same(properties.numeric, false);
        same(properties.calendar, tag === "en-u-ca-buddhist" ? "buddhist" : undefined);
        assertNativeTree(reference("localeInfo", {tag: tag}));
    });
    var properties = reference("localeProperties", {tag: "en-u-ca-buddhist-co-emoji-fw-mon-hc-h23-kf-upper-kn-nu-thai"});
    same(properties.calendar, "buddhist");
    same(properties.collation, "emoji");
    same(properties.firstDayOfWeek, "mon");
    same(properties.hourCycle, "h23");
    same(properties.caseFirst, "upper");
    same(properties.numeric, true);
    same(properties.numberingSystem, "thai");
    same(reference("localeProperties", {tag: "en-u-kn-false"}).numeric, false);
});

test("oracle/unmapped-calendar-code-lifetime", function () {
    ["en", "fr", "ar"].forEach(function (locale) {
        ["long", "short", "narrow"].forEach(function (style) {
            ["foobar", "FOOBAR", "FooBar"].forEach(function (code) {
                var result = reference("displayName", {locale: locale, options: {type: "calendar", style: style, fallback: "code"}, code: code});
                same(result.found, true);
                same(result.value, code.toLowerCase());
                var missing = reference("displayName", {locale: locale, options: {type: "calendar", style: style, fallback: "none"}, code: code});
                same(missing.found, false);
            });
        });
    });
});

test("oracle/mapped-calendar-name-ignores-fallback", function () {
    ["en", "fr", "ar"].forEach(function (locale) {
        ["long", "short", "narrow"].forEach(function (style) {
            var named = reference("displayName", {locale: locale, options: {type: "calendar", style: style, fallback: "none"}, code: "gregory"});
            same(named.found, true);
            same(typeof named.value, "string");
            assert(named.value.length > 0);
            ["gregory", "GREGORY"].forEach(function (code) {
                var result = reference("displayName", {locale: locale, options: {type: "calendar", style: style, fallback: "code"}, code: code});
                same(result.found, true);
                same(result.value, named.value);
            });
        });
    });
});

test("assertions/do-not-coerce-passing-values", function () {
    var calls = 0;
    var value = {
        toString: function () { ++calls; throw new Error("Unexpected toString"); },
        valueOf: function () { ++calls; throw new Error("Unexpected valueOf"); }
    };
    value[Symbol.toPrimitive] = function () { ++calls; throw new Error("Unexpected ToPrimitive"); };
    same(value, value);
    equal(value, value);
    equal([value], [value]);
    equal({nested: value}, {nested: value});
    var error = new TypeError();
    error.toString = value.toString;
    throws(TypeError, function () { throw error; });
    same(calls, 0);
});

test("assertions/failure-diagnostics-do-not-coerce-objects", function () {
    var value = Object.create(null);
    value[Symbol.toPrimitive] = function () { throw new TypeError("Unexpected diagnostic coercion"); };
    throws(Error, function () { same(value, {}); });
    throws(Error, function () { equal(value, 1); });
    throws(Error, function () { throws(TypeError, function () { throw value; }); });
    throws(Error, function () { same(0, -0); });
    same(NaN, NaN);
});

// Called from C++ once per currency, with explicit GC between calls and while the returned
// snapshot is still rooted. This covers interleaved polyfill/oracle calls and snapshot lifetime.
function currencyInterleavingSample(currency) {
    var options = {style: "currency", currency: currency};
    var nf = new Intl.NumberFormat("en", options);
    var defaults = reference("numberDefaults", {locale: "en", currency: currency});
    same(nf.resolvedOptions().minimumFractionDigits, defaults.currencyDigits, currency);
    same(nf.resolvedOptions().maximumFractionDigits, defaults.currencyDigits, currency);
    var expected = reference("number", {locale: "en", options: options, value: 1.2345});
    same(nf.format(1.2345), expected.text, currency);
    equal(nf.formatToParts(1.2345), expected.parts, currency);
    return {formatter: nf, expected: expected};
}
