"use strict";

// ECMA-402 §17; test262/test/intl402/PluralRules, with digit and notation options.
["en", "ar", "ru", "pl", "fr", "cy", "ja", "sl"].forEach(function (locale) {
    ["cardinal", "ordinal"].forEach(function (type) {
        [{}, {minimumFractionDigits: 2}, {maximumFractionDigits: 0}, {minimumSignificantDigits: 3, maximumSignificantDigits: 4}, {roundingMode: "floor", maximumFractionDigits: 0}, {notation: "compact"}, {notation: "compact", compactDisplay: "long"}, {notation: "scientific"}, {notation: "engineering"}].forEach(function (digits, index) {
            test(locale + "/" + type + "/" + index, function () {
                var options = Object.assign({type: type}, digits);
                var pr = new Intl.PluralRules(locale, options);
                [0, -0, 1, 2, 3, 4, 5, 11, 21, 101, 1000, 1000000, 1.1, 1.5, 2.25, -1, NaN, Infinity, -Infinity].forEach(function (value) {
                    same(pr.select(value), reference("plural", {locale: locale, options: options, value: value}));
                });
                equal(pr.resolvedOptions().pluralCategories, reference("plural", {locale: locale, options: options, categories: true}));
                [[0, 1], [1, 2], [2, 5], [1, 1], [5, 1], [1.1, 1.2]].forEach(function (range) {
                    same(pr.selectRange(range[0], range[1]), reference("plural", {locale: locale, options: options, value: range[0], end: range[1]}));
                });
            });
        });
    });
});

optionValues("PluralRules", "type", ["cardinal", "ordinal"]);
optionValues("PluralRules", "notation", ["standard", "scientific", "engineering", "compact"]);
optionValues("PluralRules", "roundingMode", ["ceil", "floor", "expand", "trunc", "halfCeil", "halfFloor", "halfExpand", "halfTrunc", "halfEven"]);
optionValues("PluralRules", "trailingZeroDisplay", ["auto", "stripIfInteger"]);
rejectsOption("PluralRules", "type", ["", "CARDINAL", null]);
rejectsOption("PluralRules", "notation", ["", "decimal", null]);
rejectsOption("PluralRules", "compactDisplay", ["", "narrow", null]);
rejectsOption("PluralRules", "roundingMode", ["", "halfUp", null]);
rejectsOption("PluralRules", "roundingPriority", ["", "more", null]);
rejectsOption("PluralRules", "trailingZeroDisplay", ["", "strip", null]);
rejectsOption("PluralRules", "roundingIncrement", [0, 3, 5001, NaN, Infinity]);
rejectsOption("PluralRules", "minimumIntegerDigits", [0, 22, NaN]);
rejectsOption("PluralRules", "minimumFractionDigits", [-1, 101, NaN]);
rejectsOption("PluralRules", "maximumFractionDigits", [-1, 101, NaN]);
rejectsOption("PluralRules", "minimumSignificantDigits", [0, 22, NaN]);
rejectsOption("PluralRules", "maximumSignificantDigits", [0, 22, NaN]);

test("resolvedOptions-defaults-and-category-isolation", function () {
    var pr = new Intl.PluralRules("ar");
    var result = pr.resolvedOptions();
    same(result.type, "cardinal");
    same(result.minimumIntegerDigits, 1);
    same(result.minimumFractionDigits, 0);
    same(result.maximumFractionDigits, 3);
    same(result.notation, "standard");
    same(result.roundingMode, "halfExpand");
    same(result.roundingIncrement, 1);
    same(result.roundingPriority, "auto");
    same(result.trailingZeroDisplay, "auto");
    result.pluralCategories.pop();
    equal(pr.resolvedOptions().pluralCategories, reference("plural", {locale: "ar", categories: true}));
    throws(RangeError, function () { new Intl.PluralRules("en", {minimumFractionDigits: 5, maximumFractionDigits: 2}); });
    throws(RangeError, function () { new Intl.PluralRules("en", {minimumSignificantDigits: 5, maximumSignificantDigits: 2}); });
});

test("coercion-and-range-errors", function () {
    var pr = new Intl.PluralRules("en");
    same(pr.select("1"), pr.select(1));
    same(pr.select(null), pr.select(0));
    same(pr.select(true), pr.select(1));
    same(pr.select(), pr.select(NaN));
    throws(TypeError, function () { pr.select(Symbol()); });
    if (typeof BigInt === "function") same(pr.select(BigInt(1)), pr.select(1));
    throws(TypeError, function () { pr.selectRange(); });
    throws(TypeError, function () { pr.selectRange(1); });
    throws(RangeError, function () { pr.selectRange(NaN, 1); });
    throws(RangeError, function () { pr.selectRange(1, NaN); });
    abrupt(function (sentinel) { pr.select({valueOf: function () { throw sentinel; }}); });
    abrupt(function (sentinel) { pr.selectRange(1, {valueOf: function () { throw sentinel; }}); });
    abrupt(function (sentinel) { new Intl.PluralRules("en", {get type() { throw sentinel; }}); });
});
