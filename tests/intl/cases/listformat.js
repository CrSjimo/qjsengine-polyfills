"use strict";

// ECMA-402 §14; test262/test/intl402/ListFormat.
localeInputs.forEach(function (locale) {
    ["conjunction", "disjunction", "unit"].forEach(function (type) {
        ["long", "short", "narrow"].forEach(function (style) {
            test(locale + "/" + type + "/" + style, function () {
                var options = {type: type, style: style};
                var lf = new Intl.ListFormat(locale, options);
                [[], ["A"], ["A", "B"], ["A", "B", "C"], ["A", "B", "C", "D"], ["", "B", ""], ["\ud83d\ude00", "\u4e2d\u6587", "e\u0301"]].forEach(function (items) {
                    var expected = reference("list", {locale: locale, options: options, items: items});
                    same(lf.format(items), expected.text);
                    var parts = lf.formatToParts(items);
                    // Empty input elements are meaningful zero-length element parts.
                    same(joined(parts), expected.text);
                    parts.forEach(function (part) {
                        ordinary(part, ["type", "value"]);
                        assert(part.type === "element" || part.type === "literal");
                        same(typeof part.value, "string");
                    });
                    equal(parts.filter(function (part) { return part.type === "element"; }).map(function (part) { return part.value; }), items);
                    if (items.every(function (item) { return item.length > 0; })) equal(parts, expected.parts);
                    same(lf.format(new Set(items)), reference("list", {locale: locale, options: options, items: Array.from(new Set(items))}).text);
                });
                ordinary(lf.resolvedOptions(), ["locale", "type", "style"]);
                same(lf.resolvedOptions().type, type);
                same(lf.resolvedOptions().style, style);
            });
        });
    });
});

optionValues("ListFormat", "type", ["conjunction", "disjunction", "unit"]);
optionValues("ListFormat", "style", ["long", "short", "narrow"]);
rejectsOption("ListFormat", "type", ["", "and", null]);
rejectsOption("ListFormat", "style", ["", "wide", null]);

test("iterable-input-and-iterator-close", function () {
    var lf = new Intl.ListFormat("en");
    same(lf.format(), lf.format([]));
    equal(lf.formatToParts(), []);
    same(lf.format("abc"), lf.format(["a", "b", "c"]));
    same(lf.format("\ud83d\ude00a"), lf.format(["\ud83d\ude00", "a"]));
    [null, true, 1, {}, {length: 1, 0: "a"}].forEach(function (value) {
        throws(TypeError, function () { lf.format(value); });
        throws(TypeError, function () { lf.formatToParts(value); });
    });
    [1, null, undefined, {}, new String("a"), Symbol()].forEach(function (element) {
        ["format", "formatToParts"].forEach(function (method) {
            var closed = false;
            var iterable = {};
            iterable[Symbol.iterator] = function () {
                return {next: function () { return {value: element, done: false}; }, return: function () { closed = true; return {}; }};
            };
            throws(TypeError, function () { lf[method](iterable); });
            same(closed, true);
        });
    });
    throws(TypeError, function () { lf.format([, "a"]); });
    abrupt(function (sentinel) {
        var iterable = {};
        iterable[Symbol.iterator] = function () { return {next: function () { throw sentinel; }}; };
        lf.format(iterable);
    });
    abrupt(function (sentinel) { new Intl.ListFormat("en", {get style() { throw sentinel; }}); });
});
