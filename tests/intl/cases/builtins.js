"use strict";

// ECMA-402 §20: locale-sensitive ECMA-262 prototype methods.
// These exercise the public JavaScript surface specified by 402, regardless of whether Qt or
// the installed polyfill eventually supplies each entry point.
localeInputs.forEach(function (locale) {
    test(locale + "/Number-toLocaleString", function () {
        [{}, {style: "currency", currency: "EUR"}, {notation: "compact"}, {style: "unit", unit: "meter"}].forEach(function (options) {
            [0, -0, 1234567.89, -2.5, NaN, Infinity].forEach(function (value) {
                same(value.toLocaleString(locale, options), reference("number", {locale: locale, options: options, value: value}).text);
                same(new Number(value).toLocaleString(locale, options), value.toLocaleString(locale, options));
            });
        });
        throws(TypeError, function () { Number.prototype.toLocaleString.call({valueOf: function () { return 1; }}, locale); });
        if (typeof BigInt === "function") {
            var value = BigInt("9007199254740993");
            same(value.toLocaleString(locale), reference("number", {locale: locale, decimal: String(value)}).text);
        }
    });

    test(locale + "/String-localeCompare", function () {
        [["a", "A"], ["\u00e4", "z"], ["2", "10"], ["\u00e9", "e\u0301"]].forEach(function (pair) {
            [{}, {sensitivity: "base"}, {numeric: true}].forEach(function (options) {
                same(Math.sign(pair[0].localeCompare(pair[1], locale, options)) || 0, reference("collate", {locale: locale, options: options, left: pair[0], right: pair[1]}));
            });
        });
        throws(TypeError, function () { String.prototype.localeCompare.call(null, "a", locale); });
        throws(TypeError, function () { "a".localeCompare(Symbol(), locale); });
    });

    test(locale + "/Date-toLocale-methods", function () {
        var value = Date.UTC(2024, 1, 29, 13, 5, 7);
        var date = new Date(value);
        var dateOptions = {timeZone: "UTC", year: "numeric", month: "numeric", day: "numeric"};
        var timeOptions = {timeZone: "UTC", hour: "numeric", minute: "numeric", second: "numeric"};
        var bothOptions = Object.assign({}, dateOptions, timeOptions);
        same(date.toLocaleDateString(locale, {timeZone: "UTC"}), reference("date", {locale: locale, options: dateOptions, value: value}).text);
        same(date.toLocaleTimeString(locale, {timeZone: "UTC"}), reference("date", {locale: locale, options: timeOptions, value: value}).text);
        same(date.toLocaleString(locale, {timeZone: "UTC"}), reference("date", {locale: locale, options: bothOptions, value: value}).text);
        ["toLocaleString", "toLocaleDateString", "toLocaleTimeString"].forEach(function (method) {
            same(new Date(NaN)[method](locale), "Invalid Date"); // specified fixed text, not locale data
            throws(TypeError, function () { Date.prototype[method].call({}, locale); });
        });
        throws(TypeError, function () { date.toLocaleDateString(locale, {timeStyle: "short"}); });
        throws(TypeError, function () { date.toLocaleTimeString(locale, {dateStyle: "short"}); });
    });
});

["en", "tr", "az", "lt", "el", "de"].forEach(function (locale) {
    [false, true].forEach(function (upper) {
        test(locale + "/case-mapping/" + upper, function () {
            var method = upper ? "toLocaleUpperCase" : "toLocaleLowerCase";
            ["I\u0130i\u0131", "I\u0307 J\u0301", "\u039f\u03a3 \u039f\u03a3\u0391", "Stra\u00dfe", "\ud83d\ude00a\ud800", ""].forEach(function (input) {
                var expected = reference("caseMap", {locale: locale, upper: upper, input: input});
                same(input[method](locale), expected);
                same(input[method]([locale, "en"]), expected);
            });
            throws(TypeError, function () { String.prototype[method].call(undefined, locale); });
            throws(RangeError, function () { "a"[method]("invalid_tag"); });
        });
    });
});
