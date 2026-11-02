"use strict";

// ECMA-402 §16; test262/test/intl402/NumberFormat, including NumberFormat-v3.
var numberOptions = [
    {}, {useGrouping: false}, {useGrouping: "min2"}, {useGrouping: "always"},
    {minimumIntegerDigits: 5}, {minimumFractionDigits: 2, maximumFractionDigits: 4},
    {minimumSignificantDigits: 3, maximumSignificantDigits: 5},
    {style: "percent", maximumFractionDigits: 2},
    {style: "currency", currency: "USD"}, {style: "currency", currency: "JPY"}, {style: "currency", currency: "KWD"},
    {style: "currency", currency: "EUR", currencyDisplay: "code"},
    {style: "currency", currency: "USD", currencyDisplay: "name"},
    {style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", currencySign: "accounting"},
    {style: "unit", unit: "meter", unitDisplay: "long"}, {style: "unit", unit: "kilometer-per-hour", unitDisplay: "short"},
    {style: "unit", unit: "celsius", unitDisplay: "narrow"},
    {notation: "scientific"}, {notation: "engineering"}, {notation: "compact"}, {notation: "compact", compactDisplay: "long"},
    {signDisplay: "always"}, {signDisplay: "never"}, {signDisplay: "exceptZero"}, {signDisplay: "negative"},
    {minimumFractionDigits: 2, maximumFractionDigits: 2, roundingIncrement: 5},
    {minimumFractionDigits: 2, maximumFractionDigits: 2, trailingZeroDisplay: "stripIfInteger"},
    {maximumFractionDigits: 2, maximumSignificantDigits: 3, roundingPriority: "morePrecision"},
    {maximumFractionDigits: 2, maximumSignificantDigits: 3, roundingPriority: "lessPrecision"}
];

localeInputs.forEach(function (locale) {
    numberOptions.forEach(function (options, index) {
        test(locale + "/format-and-parts/" + index, function () {
            var nf = new Intl.NumberFormat(locale, options);
            [0, -0, 0.125, -0.125, 1, -2.5, 1234.567, -1234567.89, NaN, Infinity, -Infinity].forEach(function (value) {
                var expected = reference("number", {locale: locale, options: options, value: value});
                same(nf.format(value), expected.text);
                var parts = nf.formatToParts(value);
                checkParts(parts, expected.text, numberPartTypes);
                equal(parts, expected.parts);
            });
        });
    });
    [{}, {style: "currency", currency: "EUR"}, {style: "unit", unit: "meter"}, {maximumFractionDigits: 0}].forEach(function (options, index) {
        test(locale + "/range-and-parts/" + index, function () {
            var nf = new Intl.NumberFormat(locale, options);
            [[1, 5], [-5, -1], [1, 1], [1.1, 1.2], [-0, 0], [5, 1], [-Infinity, Infinity]].forEach(function (range) {
                var expected = reference("number", {locale: locale, options: options, value: range[0], end: range[1]});
                same(nf.formatRange(range[0], range[1]), expected.text);
                var parts = nf.formatRangeToParts(range[0], range[1]);
                checkParts(parts, expected.text, numberPartTypes, true);
                equal(parts, expected.parts);
            });
        });
    });
});

["ceil", "floor", "expand", "trunc", "halfCeil", "halfFloor", "halfExpand", "halfTrunc", "halfEven"].forEach(function (roundingMode) {
    test("rounding/" + roundingMode, function () {
        var options = {maximumFractionDigits: 0, roundingMode: roundingMode};
        var nf = new Intl.NumberFormat("ar-EG", options);
        [2.5, -2.5, 1.5, -1.5, 2.4, -2.4, 2.6, -2.6].forEach(function (value) {
            same(nf.format(value), reference("number", {locale: "ar-EG", options: options, value: value}).text);
        });
        same(nf.resolvedOptions().roundingMode, roundingMode);
    });
});

[1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000].forEach(function (increment) {
    test("roundingIncrement/" + increment, function () {
        var options = {minimumFractionDigits: 2, maximumFractionDigits: 2, roundingIncrement: increment};
        var nf = new Intl.NumberFormat("en-US", options);
        same(nf.resolvedOptions().roundingIncrement, increment);
        [1.125, -1.125, 123.456].forEach(function (value) { same(nf.format(value), reference("number", {locale: "en-US", options: options, value: value}).text); });
    });
});

localeInputs.forEach(function (locale) {
    ["decimal", "percent", "currency"].forEach(function (style) {
        test(locale + "/resolvedOptions/" + style, function () {
            var options = {style: style, currency: "jpy"};
            var result = new Intl.NumberFormat(locale, options).resolvedOptions();
            var defaults = reference("numberDefaults", {locale: locale, currency: "JPY"});
            same(result.numberingSystem, defaults.numberingSystem);
            same(result.style, style);
            same(result.minimumIntegerDigits, 1);
            same(result.minimumFractionDigits, style === "currency" ? defaults.currencyDigits : 0);
            same(result.maximumFractionDigits, style === "currency" ? defaults.currencyDigits : style === "percent" ? 0 : 3);
            same(result.useGrouping, "auto");
            same(result.notation, "standard");
            same(result.signDisplay, "auto");
            same(result.roundingMode, "halfExpand");
            same(result.roundingIncrement, 1);
            same(result.roundingPriority, "auto");
            same(result.trailingZeroDisplay, "auto");
            same("currency" in result, style === "currency");
            same("currencyDisplay" in result, style === "currency");
            same("currencySign" in result, style === "currency");
            same("unit" in result, false);
            same("minimumSignificantDigits" in result, false);
            if (style === "currency") same(result.currency, "JPY");
        });
    });
});

optionValues("NumberFormat", "style", ["decimal", "percent"]);
optionValues("NumberFormat", "notation", ["standard", "scientific", "engineering", "compact"]);
optionValues("NumberFormat", "currencyDisplay", ["symbol", "narrowSymbol", "code", "name"], {style: "currency", currency: "USD"});
optionValues("NumberFormat", "currencySign", ["standard", "accounting"], {style: "currency", currency: "USD"});
optionValues("NumberFormat", "unitDisplay", ["short", "long", "narrow"], {style: "unit", unit: "meter"});
optionValues("NumberFormat", "signDisplay", ["auto", "never", "always", "exceptZero", "negative"]);
optionValues("NumberFormat", "trailingZeroDisplay", ["auto", "stripIfInteger"]);
optionValues("NumberFormat", "roundingPriority", ["auto", "morePrecision", "lessPrecision"]);
rejectsOption("NumberFormat", "style", ["", "scientific", null]);
rejectsOption("NumberFormat", "currency", ["", "US", "USDD", "U1D", "\u0131sd"]);
rejectsOption("NumberFormat", "currencyDisplay", ["", "long", null]);
rejectsOption("NumberFormat", "currencySign", ["", "negative", null]);
rejectsOption("NumberFormat", "unit", ["", "invalid", "meters", "meter-per-hour-per-second"]);
rejectsOption("NumberFormat", "unitDisplay", ["", "wide", null]);
rejectsOption("NumberFormat", "notation", ["", "decimal", null]);
rejectsOption("NumberFormat", "compactDisplay", ["", "narrow", null]);
rejectsOption("NumberFormat", "signDisplay", ["", "positive", null]);
rejectsOption("NumberFormat", "roundingMode", ["", "halfUp", null]);
rejectsOption("NumberFormat", "roundingPriority", ["", "more", null]);
rejectsOption("NumberFormat", "trailingZeroDisplay", ["", "strip", null]);
rejectsOption("NumberFormat", "useGrouping", ["invalid", 1]);
rejectsOption("NumberFormat", "minimumIntegerDigits", [0, 22, NaN, Infinity]);
rejectsOption("NumberFormat", "minimumFractionDigits", [-1, 101, NaN, Infinity]);
rejectsOption("NumberFormat", "maximumFractionDigits", [-1, 101, NaN, Infinity]);
rejectsOption("NumberFormat", "minimumSignificantDigits", [0, 22, NaN, Infinity]);
rejectsOption("NumberFormat", "maximumSignificantDigits", [0, 22, NaN, Infinity]);
rejectsOption("NumberFormat", "roundingIncrement", [0, 3, 6, 5001, NaN, Infinity]);
rejectsOption("NumberFormat", "numberingSystem", ["", "a", "abcdefghi", "latn_"]);

test("digits-constraints-and-required-options", function () {
    throws(TypeError, function () { new Intl.NumberFormat("en", {style: "currency"}); });
    throws(TypeError, function () { new Intl.NumberFormat("en", {style: "unit"}); });
    throws(RangeError, function () { new Intl.NumberFormat("en", {minimumFractionDigits: 3, maximumFractionDigits: 2}); });
    throws(RangeError, function () { new Intl.NumberFormat("en", {minimumSignificantDigits: 4, maximumSignificantDigits: 3}); });
    throws(RangeError, function () { new Intl.NumberFormat("en", {roundingIncrement: 5, minimumFractionDigits: 1, maximumFractionDigits: 2}); });
    throws(TypeError, function () { new Intl.NumberFormat("en", {roundingIncrement: 5, maximumSignificantDigits: 3}); });
    throws(TypeError, function () { new Intl.NumberFormat("en", {roundingIncrement: 5, roundingPriority: "morePrecision"}); });
    same(new Intl.NumberFormat("en", {minimumFractionDigits: 100}).resolvedOptions().minimumFractionDigits, 100);
    same(new Intl.NumberFormat("en", {minimumIntegerDigits: 3.9}).resolvedOptions().minimumIntegerDigits, 3);
    same(new Intl.NumberFormat("en", {minimumFractionDigits: "2"}).resolvedOptions().minimumFractionDigits, 2);
    same(new Intl.NumberFormat("en-u-nu-thai", {numberingSystem: "latn"}).resolvedOptions().numberingSystem, "latn");
    [false, 0, "", null, NaN].forEach(function (value) { same(new Intl.NumberFormat("en", {useGrouping: value}).resolvedOptions().useGrouping, false); });
    ["true", "false"].forEach(function (value) { same(new Intl.NumberFormat("en", {useGrouping: value}).resolvedOptions().useGrouping, "auto"); });
    same(new Intl.NumberFormat("en", {useGrouping: true}).resolvedOptions().useGrouping, "always");
});

test("mathematical-values-and-exact-decimal-strings", function () {
    var nf = new Intl.NumberFormat("de-DE", {maximumFractionDigits: 20});
    ["9007199254740993", "12345678901234567890.123456789", "-0", "1e25"].forEach(function (decimal) {
        var expected = reference("number", {locale: "de-DE", options: {maximumFractionDigits: 20}, decimal: decimal});
        same(nf.format(decimal), expected.text);
        equal(nf.formatToParts(decimal), expected.parts);
    });
    if (typeof BigInt === "function") {
        var value = BigInt("9007199254740993");
        same(nf.format(value), reference("number", {locale: "de-DE", options: {maximumFractionDigits: 20}, decimal: String(value)}).text);
    }
    same(nf.format(null), nf.format(0));
    same(nf.format(true), nf.format(1));
    same(nf.format(), nf.format(NaN));
    throws(TypeError, function () { nf.format(Symbol()); });
    throws(TypeError, function () { nf.formatToParts(Symbol()); });
    abrupt(function (sentinel) { nf.format({valueOf: function () { throw sentinel; }}); });
    abrupt(function (sentinel) { new Intl.NumberFormat("en", {get maximumFractionDigits() { throw sentinel; }}); });
});

test("range-errors-coercion-and-fresh-parts", function () {
    var nf = new Intl.NumberFormat("en");
    ["formatRange", "formatRangeToParts"].forEach(function (method) {
        throws(TypeError, function () { nf[method](); });
        throws(TypeError, function () { nf[method](1); });
        throws(TypeError, function () { nf[method](undefined, 2); });
        throws(RangeError, function () { nf[method](NaN, 2); });
        throws(RangeError, function () { nf[method](1, NaN); });
        throws(TypeError, function () { nf[method](Symbol(), 2); });
        var log = [];
        nf[method]({valueOf: function () { log.push("start"); return 1; }}, {valueOf: function () { log.push("end"); return 2; }});
        equal(log, ["start", "end"]);
        abrupt(function (sentinel) { nf[method](1, {valueOf: function () { throw sentinel; }}); });
    });
    var first = nf.formatToParts(1);
    var second = nf.formatToParts(1);
    assert(first !== second && first[0] !== second[0]);
    first[0].value = "mutated";
    equal(nf.formatToParts(1), second);
});

testEach("ICU-inventory/all-numbering-systems", {operation: "supportedValues", request: {key: "numberingSystem"}}, function (system) {
    var options = {numberingSystem: system, maximumFractionDigits: 2};
    var nf = new Intl.NumberFormat("en", options);
    same(nf.resolvedOptions().numberingSystem, system);
    var expected = reference("number", {locale: "en", options: options, value: -12345.67});
    same(nf.format(-12345.67), expected.text, system);
    equal(nf.formatToParts(-12345.67), expected.parts, system);
});

testEach("ICU-inventory/all-sanctioned-units", {operation: "supportedValues", request: {key: "unit"}}, function (unit) {
    ["long", "short", "narrow"].forEach(function (display) {
        var options = {style: "unit", unit: unit, unitDisplay: display};
        var nf = new Intl.NumberFormat("fr", options);
        same(nf.resolvedOptions().unit, unit);
        var expected = reference("number", {locale: "fr", options: options, value: 1234.5});
        same(nf.format(1234.5), expected.text, unit + "/" + display);
        equal(nf.formatToParts(1234.5), expected.parts);
    });
});

testEach("ICU-inventory/currency-fraction-digits", {operation: "supportedValues", request: {key: "currency"}}, function (currency) {
    var options = {style: "currency", currency: currency};
    var nf = new Intl.NumberFormat("en", options);
    var digits = reference("numberDefaults", {locale: "en", currency: currency}).currencyDigits;
    same(nf.resolvedOptions().minimumFractionDigits, digits, currency);
    same(nf.resolvedOptions().maximumFractionDigits, digits, currency);
    same(nf.format(1.2345), reference("number", {locale: "en", options: options, value: 1.2345}).text, currency);
});

["en-u-nu-thai", "ar-u-nu-latn", "en-u-nu-mathbold"].forEach(function (locale) {
    test("unicode-extension/" + locale, function () {
        var nf = new Intl.NumberFormat(locale);
        same(nf.resolvedOptions().numberingSystem, reference("numberDefaults", {locale: locale}).numberingSystem);
        same(nf.format(-1234.5), reference("number", {locale: locale, value: -1234.5}).text);
    });
});
