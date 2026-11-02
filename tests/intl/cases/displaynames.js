"use strict";

// ECMA-402 §12; test262/test/intl402/DisplayNames.
var displayCodes = {
    language: ["en", "de-DE", "zh-Hant-TW", "sr-Cyrl"], region: ["US", "DE", "419"], script: ["Latn", "Cyrl", "Hans"],
    currency: ["USD", "EUR", "JPY"], calendar: ["gregory", "buddhist", "japanese", "islamic-civil"],
    dateTimeField: ["era", "year", "quarter", "month", "weekOfYear", "weekday", "day", "dayPeriod", "hour", "minute", "second", "timeZoneName"]
};

localeInputs.forEach(function (locale) {
    Object.keys(displayCodes).forEach(function (type) {
        ["long", "short", "narrow"].forEach(function (style) {
            ["code", "none"].forEach(function (fallback) {
                test(locale + "/" + type + "/" + style + "/" + fallback, function () {
                    var options = {type: type, style: style, fallback: fallback};
                    var dn = new Intl.DisplayNames(locale, options);
                    displayCodes[type].forEach(function (code) {
                        var expected = reference("displayName", {locale: locale, options: options, code: code});
                        same(dn.of(code), expected.found ? expected.value : undefined);
                    });
                    var resolved = dn.resolvedOptions();
                    same(resolved.type, type);
                    same(resolved.style, style);
                    same(resolved.fallback, fallback);
                    same("languageDisplay" in resolved, type === "language");
                    if (type === "language") same(resolved.languageDisplay, "dialect");
                });
            });
        });
    });
    ["dialect", "standard"].forEach(function (languageDisplay) {
        test(locale + "/languageDisplay/" + languageDisplay, function () {
            var options = {type: "language", languageDisplay: languageDisplay};
            var dn = new Intl.DisplayNames(locale, options);
            ["en-US", "en-GB", "pt-BR", "zh-Hant"].forEach(function (code) {
                same(dn.of(code), reference("displayName", {locale: locale, options: options, code: code}).value);
            });
            same(dn.resolvedOptions().languageDisplay, languageDisplay);
        });
    });
});

rejectsOption("DisplayNames", "type", ["", "unit", null]);
rejectsOption("DisplayNames", "style", ["", "wide", null], {type: "language"});
rejectsOption("DisplayNames", "fallback", ["", "undefined", null], {type: "language"});
rejectsOption("DisplayNames", "languageDisplay", ["", "short", null], {type: "language"});

test("required-type-and-invalid-codes", function () {
    throws(TypeError, function () { new Intl.DisplayNames("en"); });
    throws(TypeError, function () { new Intl.DisplayNames("en", {}); });
    var invalid = {language: ["", "en_US", "x-private", "en-u-ca-gregory", "en-x-private"], region: ["", "U", "USA", "1234"], script: ["", "Lat", "Latin", "1234"], currency: ["", "US", "USDD", "U1D"], calendar: ["", "a", "abcdefghi", "gregory_"], dateTimeField: ["", "years", "timezone", "Year"]};
    Object.keys(invalid).forEach(function (type) {
        var dn = new Intl.DisplayNames("en", {type: type});
        invalid[type].forEach(function (code) { throws(RangeError, function () { dn.of(code); }); });
    });
});

test("canonical-code-fallback-and-coercion", function () {
    var dn = new Intl.DisplayNames("en", {type: "currency"});
    same(dn.of("usd"), dn.of("USD"));
    same(dn.of({toString: function () { return "USD"; }}), dn.of("USD"));
    throws(TypeError, function () { dn.of(Symbol()); });
    abrupt(function (sentinel) { dn.of({toString: function () { throw sentinel; }}); });
    abrupt(function (sentinel) { new Intl.DisplayNames("en", {get type() { throw sentinel; }}); });
    ["code", "none"].forEach(function (fallback) {
        var options = {type: "currency", fallback: fallback};
        var expected = reference("displayName", {locale: "en", options: options, code: "ZZZ"});
        same(new Intl.DisplayNames("en", options).of("ZZZ"), expected.found ? expected.value : undefined);
    });
});
