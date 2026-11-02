((bridge) => {
    "use strict";

    const toStringTag = Symbol.toStringTag;
    const iteratorSymbol = Symbol.iterator;
    const IntlObject = {};

    const collatorStates = new Map();
    const dateFormatStates = new Map();
    const displayNamesStates = new Map();
    const durationFormatStates = new Map();
    const listFormatStates = new Map();
    const localeStates = new Map();
    const numberFormatStates = new Map();
    const pluralRulesStates = new Map();
    const relativeTimeFormatStates = new Map();
    const segmenterStates = new Map();
    const segmentsStates = new Map();
    const segmentIteratorStates = new Map();

    let sanctionedUnitIdentifiers = null;
    let collationIdentifiers = null;

    function isObject(value) {
        return (typeof value === "object" && value !== null) || typeof value === "function";
    }

    function isLocaleObject(value) {
        return isObject(value) && localeStates.has(value);
    }

    function toStringValue(value) {
        if (typeof value === "symbol") {
            throw new TypeError("Cannot convert a Symbol value to a string");
        }
        return String(value);
    }

    function toNumberValue(value) {
        if (typeof value === "symbol") {
            throw new TypeError("Cannot convert a Symbol value to a number");
        }
        if (typeof value === "bigint") {
            throw new TypeError("Cannot convert a BigInt value to a number");
        }
        return Number(value);
    }

    function toIntegerOrInfinity(value) {
        const number = toNumberValue(value);
        if (number !== number) {
            return 0;
        }
        if (number === 0) {
            return 0;
        }
        if (!isFinite(number)) {
            return number;
        }
        return Math.trunc(number);
    }

    function toLength(value) {
        const number = toIntegerOrInfinity(value);
        if (number <= 0) {
            return 0;
        }
        return Math.min(number, Number.MAX_SAFE_INTEGER);
    }

    function throwBridgeError(result) {
        const message = result && typeof result.error === "string" && result.error.length > 0 ? result.error : "Intl operation failed";
        if (result && result.errorType === "RangeError") {
            throw new RangeError(message);
        }
        throw new TypeError(message);
    }

    function bridgeResult(result) {
        if (!result || result.ok !== true) {
            throwBridgeError(result);
        }
        return result;
    }

    function getOptionsObject(options, allowPrimitive) {
        if (options === undefined) {
            return null;
        }
        if (options === null) {
            throw new TypeError("Options must not be null");
        }
        if (isObject(options)) {
            return options;
        }
        if (allowPrimitive) {
            return Object(options);
        }
        throw new TypeError("Options must be an object");
    }

    function take(options, name) {
        return options === null ? undefined : options[name];
    }

    function asEnum(raw, name, allowed) {
        if (raw === undefined) {
            return undefined;
        }
        const value = toStringValue(raw);
        if (allowed.indexOf(value) === -1) {
            throw new RangeError("Invalid value for option " + name);
        }
        return value;
    }

    function asBoolean(raw) {
        return raw === undefined ? undefined : !!raw;
    }

    function asInteger(raw, name, minimum, maximum) {
        if (raw === undefined) {
            return undefined;
        }
        const number = toNumberValue(raw);
        if (!isFinite(number)) {
            throw new RangeError("Invalid value for option " + name);
        }
        const integer = Math.trunc(number);
        if (integer < minimum || integer > maximum) {
            throw new RangeError("Invalid value for option " + name);
        }
        return integer;
    }

    function asUnicodeType(raw, name) {
        if (raw === undefined) {
            return undefined;
        }
        const value = toStringValue(raw);
        if (!/^[A-Za-z0-9]{3,8}(?:-[A-Za-z0-9]{3,8})*$/.test(value)) {
            throw new RangeError("Invalid value for option " + name);
        }
        return value.toLowerCase();
    }

    function asLanguageSubtag(raw) {
        if (raw === undefined) {
            return undefined;
        }
        const value = toStringValue(raw);
        if (!isLanguageSubtag(value)) {
            throw new RangeError("Invalid language");
        }
        return value.toLowerCase();
    }

    function isLanguageSubtag(value) {
        return /^[A-Za-z]+$/.test(value) && ((value.length >= 2 && value.length <= 3) || (value.length >= 5 && value.length <= 8));
    }

    function isVariantSubtag(value) {
        return /^[A-Za-z0-9]{5,8}$/.test(value) || /^[0-9][A-Za-z0-9]{3}$/.test(value);
    }

    function isStructurallyValidLanguageTag(tag) {
        if (typeof tag !== "string" || tag.length === 0 || !/^[A-Za-z0-9-]+$/.test(tag)) {
            return false;
        }
        const parts = tag.split("-");
        for (const part of parts) {
            if (part.length === 0) {
                return false;
            }
        }
        if (!isLanguageSubtag(parts[0])) {
            return false;
        }
        let index = 1;
        if (index < parts.length && /^[A-Za-z]{4}$/.test(parts[index])) {
            index++;
        }
        if (index < parts.length && (/^[A-Za-z]{2}$/.test(parts[index]) || /^[0-9]{3}$/.test(parts[index]))) {
            index++;
        }
        const variants = new Set();
        while (index < parts.length && isVariantSubtag(parts[index])) {
            const variant = parts[index].toLowerCase();
            if (variants.has(variant)) {
                return false;
            }
            variants.add(variant);
            index++;
        }
        const extensions = new Set();
        while (index < parts.length) {
            const singleton = parts[index];
            if (!/^[A-Za-z0-9]$/.test(singleton)) {
                return false;
            }
            const lower = singleton.toLowerCase();
            if (extensions.has(lower)) {
                return false;
            }
            extensions.add(lower);
            index++;
            if (lower === "x") {
                if (index >= parts.length) {
                    return false;
                }
                while (index < parts.length) {
                    if (!/^[A-Za-z0-9]{1,8}$/.test(parts[index])) {
                        return false;
                    }
                    index++;
                }
                return true;
            }
            if (lower === "u") {
                if (index >= parts.length) {
                    return false;
                }
                let sawValue = false;
                while (index < parts.length) {
                    const part = parts[index];
                    if (/^[A-Za-z0-9]{2}$/.test(part)) {
                        sawValue = true;
                        index++;
                        while (index < parts.length && /^[A-Za-z0-9]{3,8}$/.test(parts[index])) {
                            index++;
                        }
                    } else if (/^[A-Za-z0-9]{3,8}$/.test(part)) {
                        sawValue = true;
                        index++;
                    } else if (/^[A-Za-z0-9]$/.test(part)) {
                        break;
                    } else {
                        return false;
                    }
                }
                if (!sawValue) {
                    return false;
                }
                continue;
            }
            if (lower === "t") {
                if (index >= parts.length) {
                    return false;
                }
                let sawValue = false;
                while (index < parts.length && /^[A-Za-z0-9]{2,8}$/.test(parts[index])) {
                    sawValue = true;
                    index++;
                }
                if (!sawValue) {
                    return false;
                }
                continue;
            }
            if (index >= parts.length || !/^[A-Za-z0-9]{3,8}$/.test(parts[index])) {
                return false;
            }
            while (index < parts.length && /^[A-Za-z0-9]{3,8}$/.test(parts[index])) {
                index++;
            }
        }
        return true;
    }

    function canonicalizeRawTag(tag) {
        if (!isStructurallyValidLanguageTag(tag)) {
            throw new RangeError("Invalid language tag: \"" + tag + "\"");
        }
        const result = bridgeResult(bridge.canonicalizeLocales([tag]));
        return result.locales[0];
    }

    function canonicalizeLocaleList(locales) {
        if (locales === undefined) {
            return [];
        }
        if (locales === null) {
            throw new TypeError("Locales must not be null");
        }
        if (isLocaleObject(locales)) {
            return [localeStates.get(locales).tag];
        }
        if (typeof locales === "string") {
            return [canonicalizeRawTag(locales)];
        }
        if (!isObject(locales)) {
            return [];
        }
        const length = toLength(take(locales, "length"));
        const raw = [];
        for (let index = 0; index < length; index++) {
            if (index in locales) {
                const value = locales[index];
                if (typeof value === "string") {
                    raw.push(value);
                } else if (isLocaleObject(value)) {
                    raw.push(localeStates.get(value).tag);
                } else if (isObject(value)) {
                    raw.push(toStringValue(value));
                } else {
                    throw new TypeError("Language tag must be a string");
                }
            }
        }
        const result = bridgeResult(bridge.canonicalizeLocales(raw));
        return toArray(result.locales);
    }

    function readLocaleMatcher(options) {
        const raw = take(options, "localeMatcher");
        if (raw === undefined) {
            return "best fit";
        }
        const value = toStringValue(raw);
        if (value !== "lookup" && value !== "best fit") {
            throw new RangeError("Invalid value for option localeMatcher");
        }
        return value;
    }

    function resolveLocale(requested, service, keywordOptions) {
        return bridgeResult(bridge.resolveLocale(requested, service, keywordOptions || {}));
    }

    function supportedLocalesOf(locales, options, service) {
        const requested = canonicalizeLocaleList(locales);
        const parsedOptions = getOptionsObject(options, true);
        readLocaleMatcher(parsedOptions);
        const result = bridgeResult(bridge.supportedLocalesOf(requested, service));
        return toArray(result.locales);
    }

    function toArray(value) {
        return Array.prototype.slice.call(value);
    }

    function copyObject(object) {
        const result = {};
        const keys = Object.keys(object);
        for (let index = 0; index < keys.length; index++) {
            result[keys[index]] = object[keys[index]];
        }
        return result;
    }

    function defineMethod(object, name, length, implementation) {
        const holder = {
            [name]() {
                return implementation.apply(this, arguments);
            }
        };
        const method = holder[name];
        Object.defineProperty(method, "length", { value: length, writable: false, enumerable: false, configurable: true });
        Object.defineProperty(object, name, { value: method, writable: true, enumerable: false, configurable: true });
        return method;
    }

    function defineGetter(object, name, implementation) {
        const holder = {
            get [name]() {
                return implementation.call(this);
            }
        };
        const descriptor = Object.getOwnPropertyDescriptor(holder, name);
        Object.defineProperty(object, name, { get: descriptor.get, set: undefined, enumerable: false, configurable: true });
        return descriptor.get;
    }

    function makeBoundFunction(length, implementation) {
        const fn = length === 2 ? (left, right) => implementation(left, right) : (value) => implementation(value);
        Object.defineProperty(fn, "name", { value: "", writable: false, enumerable: false, configurable: true });
        Object.defineProperty(fn, "length", { value: length, writable: false, enumerable: false, configurable: true });
        return fn;
    }

    function createInstance(newTarget, constructor) {
        let prototype = newTarget.prototype;
        if (!(prototype !== null && (typeof prototype === "object" || typeof prototype === "function"))) {
            prototype = constructor.prototype;
        }
        return Object.create(prototype);
    }

    function installConstructor(name, constructor, length, methods, getters) {
        Object.defineProperty(constructor, "name", { value: name, writable: false, enumerable: false, configurable: true });
        Object.defineProperty(constructor, "length", { value: length, writable: false, enumerable: false, configurable: true });
        Object.defineProperty(constructor, "prototype", { value: constructor.prototype, writable: false, enumerable: false, configurable: false });
        Object.defineProperty(constructor.prototype, "constructor", { value: constructor, writable: true, enumerable: false, configurable: true });
        Object.defineProperty(constructor.prototype, toStringTag, { value: "Intl." + name, writable: false, enumerable: false, configurable: true });
        for (const method of methods) {
            defineMethod(constructor.prototype, method.name, method.length, method.implementation);
        }
        for (const getter of getters) {
            defineGetter(constructor.prototype, getter.name, getter.implementation);
        }
        Object.defineProperty(IntlObject, name, { value: constructor, writable: true, enumerable: false, configurable: true });
    }

    function sanctionedUnits() {
        if (sanctionedUnitIdentifiers === null) {
            const result = bridgeResult(bridge.supportedValuesOf("unit"));
            sanctionedUnitIdentifiers = new Set(result.values);
        }
        return sanctionedUnitIdentifiers;
    }

    function sanctionedCollations() {
        if (collationIdentifiers === null) {
            const result = bridgeResult(bridge.supportedValuesOf("collation"));
            collationIdentifiers = new Set(result.values);
        }
        return collationIdentifiers;
    }

    function isSanctionedUnit(unit) {
        const parts = unit.toLowerCase().split("-per-");
        if (parts.length > 2) {
            return false;
        }
        const units = sanctionedUnits();
        return parts.every(function (part) { return units.has(part); });
    }

    function asUnit(raw) {
        if (raw === undefined) {
            return undefined;
        }
        const value = toStringValue(raw).toLowerCase();
        if (!isSanctionedUnit(value)) {
            throw new RangeError("Invalid unit");
        }
        return value;
    }

    function asCurrency(raw) {
        if (raw === undefined) {
            return undefined;
        }
        const value = toStringValue(raw);
        if (!/^[A-Za-z]{3}$/.test(value)) {
            throw new RangeError("Invalid currency code");
        }
        return value.toUpperCase();
    }

    function readDigitOptions(options) {
        const minimumIntegerDigits = asInteger(take(options, "minimumIntegerDigits"), "minimumIntegerDigits", 1, 21);
        const minimumFractionDigits = asInteger(take(options, "minimumFractionDigits"), "minimumFractionDigits", 0, 100);
        const maximumFractionDigits = asInteger(take(options, "maximumFractionDigits"), "maximumFractionDigits", 0, 100);
        const minimumSignificantDigits = asInteger(take(options, "minimumSignificantDigits"), "minimumSignificantDigits", 1, 21);
        const maximumSignificantDigits = asInteger(take(options, "maximumSignificantDigits"), "maximumSignificantDigits", 1, 21);
        const roundingIncrement = asInteger(take(options, "roundingIncrement"), "roundingIncrement", 1, 5000);
        const roundingMode = asEnum(take(options, "roundingMode"), "roundingMode", ["ceil", "floor", "expand", "trunc", "halfCeil", "halfFloor", "halfExpand", "halfTrunc", "halfEven"]);
        const roundingPriority = asEnum(take(options, "roundingPriority"), "roundingPriority", ["auto", "morePrecision", "lessPrecision"]);
        const trailingZeroDisplay = asEnum(take(options, "trailingZeroDisplay"), "trailingZeroDisplay", ["auto", "stripIfInteger"]);
        return {
            minimumIntegerDigits: minimumIntegerDigits,
            minimumFractionDigits: minimumFractionDigits,
            maximumFractionDigits: maximumFractionDigits,
            minimumSignificantDigits: minimumSignificantDigits,
            maximumSignificantDigits: maximumSignificantDigits,
            roundingIncrement: roundingIncrement,
            roundingMode: roundingMode,
            roundingPriority: roundingPriority,
            trailingZeroDisplay: trailingZeroDisplay
        };
    }

    function resolveDigits(digits, defaultMinimumFraction, defaultMaximumFraction) {
        if (digits.minimumFractionDigits !== undefined && digits.maximumFractionDigits !== undefined && digits.minimumFractionDigits > digits.maximumFractionDigits) {
            throw new RangeError("minimumFractionDigits is greater than maximumFractionDigits");
        }
        if (digits.minimumSignificantDigits !== undefined && digits.maximumSignificantDigits !== undefined && digits.minimumSignificantDigits > digits.maximumSignificantDigits) {
            throw new RangeError("minimumSignificantDigits is greater than maximumSignificantDigits");
        }
        const roundingIncrement = digits.roundingIncrement === undefined ? 1 : digits.roundingIncrement;
        if (roundingIncrement !== 1 && [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000].indexOf(roundingIncrement) === -1) {
            throw new RangeError("Invalid roundingIncrement");
        }
        if (roundingIncrement !== 1) {
            if (digits.minimumSignificantDigits !== undefined || digits.maximumSignificantDigits !== undefined) {
                throw new TypeError("roundingIncrement is incompatible with significant digits");
            }
            if (digits.roundingPriority !== undefined && digits.roundingPriority !== "auto") {
                throw new TypeError("roundingIncrement is incompatible with roundingPriority");
            }
            if (digits.minimumFractionDigits === undefined || digits.maximumFractionDigits === undefined || digits.minimumFractionDigits !== digits.maximumFractionDigits) {
                throw new RangeError("roundingIncrement requires equal minimum and maximum fraction digits");
            }
        }
        let minimumFractionDigits = digits.minimumFractionDigits === undefined ? defaultMinimumFraction : digits.minimumFractionDigits;
        let maximumFractionDigits = digits.maximumFractionDigits === undefined ? defaultMaximumFraction : digits.maximumFractionDigits;
        if (digits.minimumFractionDigits === undefined && digits.maximumFractionDigits !== undefined) {
            minimumFractionDigits = Math.min(defaultMinimumFraction, maximumFractionDigits);
        } else if (digits.minimumFractionDigits !== undefined && digits.maximumFractionDigits === undefined) {
            maximumFractionDigits = Math.max(defaultMaximumFraction, minimumFractionDigits);
        }
        const significant = digits.minimumSignificantDigits !== undefined || digits.maximumSignificantDigits !== undefined;
        return {
            minimumIntegerDigits: digits.minimumIntegerDigits === undefined ? 1 : digits.minimumIntegerDigits,
            minimumFractionDigits: minimumFractionDigits,
            maximumFractionDigits: maximumFractionDigits,
            minimumSignificantDigits: significant ? (digits.minimumSignificantDigits === undefined ? 1 : digits.minimumSignificantDigits) : undefined,
            maximumSignificantDigits: significant ? (digits.maximumSignificantDigits === undefined ? 21 : digits.maximumSignificantDigits) : undefined,
            roundingIncrement: roundingIncrement,
            roundingMode: digits.roundingMode === undefined ? "halfExpand" : digits.roundingMode,
            roundingPriority: digits.roundingPriority === undefined ? "auto" : digits.roundingPriority,
            trailingZeroDisplay: digits.trailingZeroDisplay === undefined ? "auto" : digits.trailingZeroDisplay
        };
    }

    function digitsInput(digits) {
        const result = {};
        if (digits.minimumIntegerDigits !== undefined) result.minimumIntegerDigits = digits.minimumIntegerDigits;
        if (digits.minimumFractionDigits !== undefined) result.minimumFractionDigits = digits.minimumFractionDigits;
        if (digits.maximumFractionDigits !== undefined) result.maximumFractionDigits = digits.maximumFractionDigits;
        if (digits.minimumSignificantDigits !== undefined) result.minimumSignificantDigits = digits.minimumSignificantDigits;
        if (digits.maximumSignificantDigits !== undefined) result.maximumSignificantDigits = digits.maximumSignificantDigits;
        if (digits.roundingIncrement !== undefined) result.roundingIncrement = digits.roundingIncrement;
        if (digits.roundingMode !== undefined) result.roundingMode = digits.roundingMode;
        if (digits.roundingPriority !== undefined) result.roundingPriority = digits.roundingPriority;
        if (digits.trailingZeroDisplay !== undefined) result.trailingZeroDisplay = digits.trailingZeroDisplay;
        return result;
    }

    function addDigitsToResolved(resolved, digits) {
        resolved.minimumIntegerDigits = digits.minimumIntegerDigits;
        resolved.minimumFractionDigits = digits.minimumFractionDigits;
        resolved.maximumFractionDigits = digits.maximumFractionDigits;
        if (digits.minimumSignificantDigits !== undefined) {
            resolved.minimumSignificantDigits = digits.minimumSignificantDigits;
            resolved.maximumSignificantDigits = digits.maximumSignificantDigits;
        }
        resolved.roundingMode = digits.roundingMode;
        resolved.roundingIncrement = digits.roundingIncrement;
        resolved.roundingPriority = digits.roundingPriority;
        resolved.trailingZeroDisplay = digits.trailingZeroDisplay;
    }

    function readUseGrouping(raw) {
        if (raw === undefined) {
            return undefined;
        }
        if (raw === true) {
            return "always";
        }
        if (raw === false) {
            return false;
        }
        if (typeof raw === "string") {
            if (raw === "true" || raw === "false") {
                return "auto";
            }
            if (raw === "always") {
                return "always";
            }
            if (raw === "min2") {
                return "min2";
            }
            if (raw === "auto") {
                return "auto";
            }
            if (raw === "") {
                return false;
            }
            throw new RangeError("Invalid value for option useGrouping");
        }
        if (!raw) {
            return false;
        }
        throw new RangeError("Invalid value for option useGrouping");
    }

    function resolveNumberFormatState(requested, options) {
        readLocaleMatcher(options);
        const numberingSystemOption = asUnicodeType(take(options, "numberingSystem"), "numberingSystem");
        const style = asEnum(take(options, "style"), "style", ["decimal", "percent", "currency", "unit"]) || "decimal";
        const currency = asCurrency(take(options, "currency"));
        const currencyDisplay = asEnum(take(options, "currencyDisplay"), "currencyDisplay", ["symbol", "narrowSymbol", "code", "name"]);
        const currencySign = asEnum(take(options, "currencySign"), "currencySign", ["standard", "accounting"]);
        const unit = asUnit(take(options, "unit"));
        const unitDisplay = asEnum(take(options, "unitDisplay"), "unitDisplay", ["short", "long", "narrow"]);
        const notation = asEnum(take(options, "notation"), "notation", ["standard", "scientific", "engineering", "compact"]) || "standard";
        const digits = readDigitOptions(options);
        const compactDisplay = asEnum(take(options, "compactDisplay"), "compactDisplay", ["short", "long"]);
        const useGrouping = readUseGrouping(take(options, "useGrouping"));
        const signDisplay = asEnum(take(options, "signDisplay"), "signDisplay", ["auto", "never", "always", "exceptZero", "negative"]);

        if (style === "currency" && currency === undefined) {
            throw new TypeError("currency is required when style is currency");
        }
        if (style === "unit" && unit === undefined) {
            throw new TypeError("unit is required when style is unit");
        }

        const keywordOptions = {};
        if (numberingSystemOption !== undefined) keywordOptions.numberingSystem = numberingSystemOption;
        const resolvedLocale = resolveLocale(requested, "NumberFormat", keywordOptions);
        const numberingSystem = numberingSystemOption !== undefined ? numberingSystemOption : (resolvedLocale.numberingSystem || resolvedLocale.defaultNumberingSystem);

        let currencyDigits = 2;
        if (currency !== undefined) {
            const defaults = bridgeResult(bridge.numberDefaults({ locale: resolvedLocale.locale, currency: currency }));
            currencyDigits = defaults.currencyDigits;
        }

        let defaultMinimumFraction = 0;
        let defaultMaximumFraction = 3;
        if (style === "currency") {
            defaultMinimumFraction = currencyDigits;
            defaultMaximumFraction = currencyDigits;
        } else if (style === "percent") {
            defaultMaximumFraction = 0;
        }
        if (notation === "compact") {
            defaultMaximumFraction = 0;
        }
        const resolvedDigits = resolveDigits(digits, defaultMinimumFraction, defaultMaximumFraction);

        const input = { style: style, notation: notation };
        if (currency !== undefined) input.currency = currency;
        if (currencyDisplay !== undefined) input.currencyDisplay = currencyDisplay;
        if (currencySign !== undefined) input.currencySign = currencySign;
        if (unit !== undefined) input.unit = unit;
        if (unitDisplay !== undefined) input.unitDisplay = unitDisplay;
        if (numberingSystemOption !== undefined) input.numberingSystem = numberingSystemOption;
        const digitInput = digitsInput(digits);
        for (const key of Object.keys(digitInput)) input[key] = digitInput[key];
        if (compactDisplay !== undefined) input.compactDisplay = compactDisplay;
        if (useGrouping !== undefined) input.useGrouping = useGrouping;
        if (signDisplay !== undefined) input.signDisplay = signDisplay;

        const resolved = { locale: resolvedLocale.locale, numberingSystem: numberingSystem, style: style };
        if (style === "currency") {
            resolved.currency = currency;
            resolved.currencyDisplay = currencyDisplay === undefined ? "symbol" : currencyDisplay;
            resolved.currencySign = currencySign === undefined ? "standard" : currencySign;
        }
        if (style === "unit") {
            resolved.unit = unit;
            resolved.unitDisplay = unitDisplay === undefined ? "short" : unitDisplay;
        }
        addDigitsToResolved(resolved, resolvedDigits);
        if (notation === "compact") {
            resolved.compactDisplay = compactDisplay === undefined ? "short" : compactDisplay;
        }
        resolved.notation = notation;
        resolved.signDisplay = signDisplay === undefined ? "auto" : signDisplay;
        resolved.useGrouping = useGrouping === undefined ? "auto" : useGrouping;

        return { locale: resolvedLocale.locale, input: input, resolved: resolved };
    }

    function numberFormatArgument(value) {
        if (typeof value === "bigint") {
            return { decimal: value.toString() };
        }
        if (typeof value === "string" && /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(value)) {
            return { decimal: value };
        }
        return { number: toNumberValue(value) };
    }

    function numberRequest(state, argument, withParts) {
        const request = { locale: state.locale, options: state.input, parts: withParts === true };
        if (argument.decimal !== undefined) {
            request.decimal = argument.decimal;
        } else {
            request.value = argument.number;
        }
        return request;
    }

    function formatNumberValue(state, value) {
        const result = bridgeResult(bridge.formatNumber(numberRequest(state, numberFormatArgument(value), false)));
        return result.text;
    }

    function formatNumberParts(state, value) {
        const result = bridgeResult(bridge.formatNumber(numberRequest(state, numberFormatArgument(value), true)));
        return result.parts.map(function (part) { return { type: part.type, value: part.value }; });
    }

    function numberRangeArguments(start, end) {
        if (start === undefined || end === undefined) {
            throw new TypeError("Both range endpoints are required");
        }
        const startNumber = toNumberValue(start);
        const endNumber = toNumberValue(end);
        if (startNumber !== startNumber || endNumber !== endNumber) {
            throw new RangeError("Invalid range");
        }
        return { start: startNumber, end: endNumber };
    }

    function NumberFormat(locales, options) {
        if (!new.target) {
            return new NumberFormat(locales, options);
        }
        const requested = canonicalizeLocaleList(locales);
        const parsedOptions = getOptionsObject(options, true);
        const instance = createInstance(new.target, NumberFormat);
        numberFormatStates.set(instance, resolveNumberFormatState(requested, parsedOptions));
        return instance;
    }

    installConstructor("NumberFormat", NumberFormat, 0, [
        { name: "resolvedOptions", length: 0, implementation: function () {
            const state = numberFormatStates.get(this);
            if (!state) throw new TypeError("Intl.NumberFormat.prototype.resolvedOptions called on an incompatible receiver");
            return copyObject(state.resolved);
        } },
        { name: "formatToParts", length: 1, implementation: function (value) {
            const state = numberFormatStates.get(this);
            if (!state) throw new TypeError("Intl.NumberFormat.prototype.formatToParts called on an incompatible receiver");
            return formatNumberParts(state, value);
        } },
        { name: "formatRange", length: 2, implementation: function (start, end) {
            const state = numberFormatStates.get(this);
            if (!state) throw new TypeError("Intl.NumberFormat.prototype.formatRange called on an incompatible receiver");
            const range = numberRangeArguments(start, end);
            const result = bridgeResult(bridge.formatNumber({ locale: state.locale, options: state.input, value: range.start, end: range.end, parts: false }));
            return result.text;
        } },
        { name: "formatRangeToParts", length: 2, implementation: function (start, end) {
            const state = numberFormatStates.get(this);
            if (!state) throw new TypeError("Intl.NumberFormat.prototype.formatRangeToParts called on an incompatible receiver");
            const range = numberRangeArguments(start, end);
            const result = bridgeResult(bridge.formatNumber({ locale: state.locale, options: state.input, value: range.start, end: range.end, parts: true }));
            return result.parts.map(function (part) { return { type: part.type, value: part.value, source: part.source }; });
        } }
    ], [
        { name: "format", implementation: function () {
            const state = numberFormatStates.get(this);
            if (!state) throw new TypeError("Intl.NumberFormat.prototype.format called on an incompatible receiver");
            if (state.boundFormat === undefined) {
                state.boundFormat = makeBoundFunction(1, function (value) { return formatNumberValue(state, value); });
            }
            return state.boundFormat;
        } }
    ]);
    defineMethod(NumberFormat, "supportedLocalesOf", 1, function (locales, options) {
        return supportedLocalesOf(locales, options, "NumberFormat");
    });

    function resolveCollatorState(requested, options) {
        const usage = asEnum(take(options, "usage"), "usage", ["sort", "search"]) || "sort";
        readLocaleMatcher(options);
        const collation = asUnicodeType(take(options, "collation"), "collation");
        const numeric = asBoolean(take(options, "numeric"));
        const caseFirst = asEnum(take(options, "caseFirst"), "caseFirst", ["upper", "lower", "false"]);
        const sensitivity = asEnum(take(options, "sensitivity"), "sensitivity", ["base", "accent", "case", "variant"]) || "variant";
        const ignorePunctuation = asBoolean(take(options, "ignorePunctuation"));

        const keywordOptions = {};
        if (collation !== undefined) keywordOptions.collation = collation;
        if (numeric !== undefined) keywordOptions.numeric = numeric;
        if (caseFirst !== undefined) keywordOptions.caseFirst = caseFirst;
        const resolvedLocale = resolveLocale(requested, "Collator", keywordOptions);

        let resolvedCollation = "default";
        const collationCandidate = collation !== undefined ? collation : resolvedLocale.collation;
        if (collationCandidate && sanctionedCollations().has(collationCandidate)) {
            resolvedCollation = collationCandidate;
        }
        const resolvedNumeric = numeric !== undefined ? numeric : resolvedLocale.numeric === "true";
        let resolvedCaseFirst = "false";
        if (caseFirst !== undefined) {
            resolvedCaseFirst = caseFirst;
        } else if (resolvedLocale.caseFirst === "upper" || resolvedLocale.caseFirst === "lower") {
            resolvedCaseFirst = resolvedLocale.caseFirst;
        }

        const input = { usage: usage };
        if (collation !== undefined) input.collation = collation;
        if (numeric !== undefined) input.numeric = numeric;
        if (caseFirst !== undefined) input.caseFirst = caseFirst;
        input.sensitivity = sensitivity;
        if (ignorePunctuation !== undefined) input.ignorePunctuation = ignorePunctuation;

        const resolved = {
            locale: resolvedLocale.locale,
            usage: usage,
            sensitivity: sensitivity,
            ignorePunctuation: ignorePunctuation === true,
            collation: resolvedCollation,
            numeric: resolvedNumeric,
            caseFirst: resolvedCaseFirst
        };
        return { locale: resolvedLocale.locale, input: input, resolved: resolved, boundCompare: undefined };
    }

    function Collator(locales, options) {
        if (!new.target) {
            return new Collator(locales, options);
        }
        const requested = canonicalizeLocaleList(locales);
        const parsedOptions = getOptionsObject(options, true);
        const instance = createInstance(new.target, Collator);
        collatorStates.set(instance, resolveCollatorState(requested, parsedOptions));
        return instance;
    }

    installConstructor("Collator", Collator, 0, [
        { name: "resolvedOptions", length: 0, implementation: function () {
            const state = collatorStates.get(this);
            if (!state) throw new TypeError("Intl.Collator.prototype.resolvedOptions called on an incompatible receiver");
            return copyObject(state.resolved);
        } }
    ], [
        { name: "compare", implementation: function () {
            const state = collatorStates.get(this);
            if (!state) throw new TypeError("Intl.Collator.prototype.compare called on an incompatible receiver");
            if (state.boundCompare === undefined) {
                state.boundCompare = makeBoundFunction(2, function (left, right) {
                    const leftString = toStringValue(left);
                    const rightString = toStringValue(right);
                    const result = bridgeResult(bridge.collate({ locale: state.locale, options: state.input, left: leftString, right: rightString }));
                    return result.comparison;
                });
            }
            return state.boundCompare;
        } }
    ]);
    defineMethod(Collator, "supportedLocalesOf", 1, function (locales, options) {
        return supportedLocalesOf(locales, options, "Collator");
    });

    const dateComponentNames = ["weekday", "era", "year", "month", "day", "dayPeriod", "hour", "minute", "second", "fractionalSecondDigits", "timeZoneName"];

    function resolveDateTimeFormatState(requested, options) {
        readLocaleMatcher(options);
        const calendar = asUnicodeType(take(options, "calendar"), "calendar");
        const numberingSystemOption = asUnicodeType(take(options, "numberingSystem"), "numberingSystem");
        const hour12 = asBoolean(take(options, "hour12"));
        const hourCycleOption = asEnum(take(options, "hourCycle"), "hourCycle", ["h11", "h12", "h23", "h24"]);
        const timeZoneRaw = take(options, "timeZone");
        let timeZone = undefined;
        if (timeZoneRaw !== undefined) {
            timeZone = bridgeResult(bridge.canonicalizeTimeZone({ timeZone: toStringValue(timeZoneRaw) })).timeZone;
        }
        const weekday = asEnum(take(options, "weekday"), "weekday", ["long", "short", "narrow"]);
        const era = asEnum(take(options, "era"), "era", ["long", "short", "narrow"]);
        const year = asEnum(take(options, "year"), "year", ["numeric", "2-digit"]);
        const month = asEnum(take(options, "month"), "month", ["numeric", "2-digit", "long", "short", "narrow"]);
        const day = asEnum(take(options, "day"), "day", ["numeric", "2-digit"]);
        const dayPeriod = asEnum(take(options, "dayPeriod"), "dayPeriod", ["long", "short", "narrow"]);
        const hour = asEnum(take(options, "hour"), "hour", ["numeric", "2-digit"]);
        const minute = asEnum(take(options, "minute"), "minute", ["numeric", "2-digit"]);
        const second = asEnum(take(options, "second"), "second", ["numeric", "2-digit"]);
        const fractionalSecondDigits = asInteger(take(options, "fractionalSecondDigits"), "fractionalSecondDigits", 1, 3);
        const timeZoneName = asEnum(take(options, "timeZoneName"), "timeZoneName", ["long", "short", "shortOffset", "longOffset", "shortGeneric", "longGeneric"]);
        const formatMatcher = asEnum(take(options, "formatMatcher"), "formatMatcher", ["basic", "best fit"]);
        const dateStyle = asEnum(take(options, "dateStyle"), "dateStyle", ["full", "long", "medium", "short"]);
        const timeStyle = asEnum(take(options, "timeStyle"), "timeStyle", ["full", "long", "medium", "short"]);

        const provided = {
            weekday: weekday, era: era, year: year, month: month, day: day, dayPeriod: dayPeriod,
            hour: hour, minute: minute, second: second, fractionalSecondDigits: fractionalSecondDigits,
            timeZoneName: timeZoneName
        };
        if (dateStyle !== undefined || timeStyle !== undefined) {
            for (const key of dateComponentNames) {
                if (provided[key] !== undefined) {
                    throw new TypeError("dateStyle and timeStyle may not be used with component options");
                }
            }
        }

        const keywordOptions = {};
        if (calendar !== undefined) keywordOptions.calendar = calendar;
        if (numberingSystemOption !== undefined) keywordOptions.numberingSystem = numberingSystemOption;
        const resolvedLocale = resolveLocale(requested, "DateTimeFormat", keywordOptions);
        const numberingSystem = numberingSystemOption !== undefined ? numberingSystemOption : (resolvedLocale.numberingSystem || resolvedLocale.defaultNumberingSystem);
        const resolvedCalendar = resolvedLocale.calendar || resolvedLocale.defaultCalendar;

        const defaultHourCycle = resolvedLocale.hourCycle || resolvedLocale.defaultHourCycle;
        let computedHourCycle = defaultHourCycle;
        if (hour12 !== undefined) {
            if (hour12) {
                computedHourCycle = (defaultHourCycle === "h11" || defaultHourCycle === "h12") ? defaultHourCycle : "h12";
            } else {
                computedHourCycle = (defaultHourCycle === "h23" || defaultHourCycle === "h24") ? defaultHourCycle : "h23";
            }
        } else if (hourCycleOption !== undefined) {
            computedHourCycle = hourCycleOption;
        }

        const input = {};
        if (calendar !== undefined) input.calendar = calendar;
        if (numberingSystemOption !== undefined) input.numberingSystem = numberingSystemOption;
        if (hour12 !== undefined) input.hour12 = hour12;
        if (hourCycleOption !== undefined) input.hourCycle = hourCycleOption;
        if (timeZone !== undefined) input.timeZone = timeZone;
        if (weekday !== undefined) input.weekday = weekday;
        if (era !== undefined) input.era = era;
        if (year !== undefined) input.year = year;
        if (month !== undefined) input.month = month;
        if (day !== undefined) input.day = day;
        if (dayPeriod !== undefined) input.dayPeriod = dayPeriod;
        if (hour !== undefined) input.hour = hour;
        if (minute !== undefined) input.minute = minute;
        if (second !== undefined) input.second = second;
        if (fractionalSecondDigits !== undefined) input.fractionalSecondDigits = fractionalSecondDigits;
        if (timeZoneName !== undefined) input.timeZoneName = timeZoneName;
        if (formatMatcher !== undefined) input.formatMatcher = formatMatcher;
        if (dateStyle !== undefined) input.dateStyle = dateStyle;
        if (timeStyle !== undefined) input.timeStyle = timeStyle;

        let resolvedTimeZone = timeZone;
        if (resolvedTimeZone === undefined) {
            resolvedTimeZone = bridgeResult(bridge.dateDefaults({ locale: resolvedLocale.locale, options: input })).timeZone;
        }

        const hasComponents = dateComponentNames.some(function (key) { return provided[key] !== undefined; });
        const resolved = {
            locale: resolvedLocale.locale,
            calendar: resolvedCalendar,
            numberingSystem: numberingSystem,
            timeZone: resolvedTimeZone
        };
        if (dateStyle !== undefined) resolved.dateStyle = dateStyle;
        if (timeStyle !== undefined) resolved.timeStyle = timeStyle;
        if (dateStyle === undefined && timeStyle === undefined) {
            if (!hasComponents) {
                resolved.year = "numeric";
                resolved.month = "numeric";
                resolved.day = "numeric";
            } else {
                for (const key of dateComponentNames) {
                    if (provided[key] !== undefined) resolved[key] = provided[key];
                }
            }
        }
        if (hour !== undefined || timeStyle !== undefined) {
            resolved.hourCycle = computedHourCycle;
            resolved.hour12 = computedHourCycle === "h11" || computedHourCycle === "h12";
        }

        return { locale: resolvedLocale.locale, input: input, resolved: resolved };
    }

    function toTimeClip(value) {
        const number = toNumberValue(value);
        if (!isFinite(number) || Math.abs(number) > 8640000000000000) {
            throw new RangeError("Invalid time value");
        }
        const clipped = Math.trunc(number);
        return clipped === 0 ? 0 : clipped;
    }

    function dateRequest(state, value) {
        return { locale: state.locale, options: state.input, value: value };
    }

    function formatDateValue(state, value) {
        const time = value === undefined ? Date.now() : toTimeClip(value);
        return bridgeResult(bridge.formatDate(dateRequest(state, time))).text;
    }

    function formatDateParts(state, value) {
        const time = value === undefined ? Date.now() : toTimeClip(value);
        const result = bridgeResult(bridge.formatDate(dateRequest(state, time)));
        return result.parts.map(function (part) { return { type: part.type, value: part.value }; });
    }

    function dateRangeArguments(start, end) {
        if (start === undefined || end === undefined) {
            throw new TypeError("Both range endpoints are required");
        }
        return { start: toTimeClip(start), end: toTimeClip(end) };
    }

    function DateTimeFormat(locales, options) {
        if (!new.target) {
            return new DateTimeFormat(locales, options);
        }
        const requested = canonicalizeLocaleList(locales);
        const parsedOptions = getOptionsObject(options, true);
        const instance = createInstance(new.target, DateTimeFormat);
        dateFormatStates.set(instance, resolveDateTimeFormatState(requested, parsedOptions));
        return instance;
    }

    installConstructor("DateTimeFormat", DateTimeFormat, 0, [
        { name: "resolvedOptions", length: 0, implementation: function () {
            const state = dateFormatStates.get(this);
            if (!state) throw new TypeError("Intl.DateTimeFormat.prototype.resolvedOptions called on an incompatible receiver");
            return copyObject(state.resolved);
        } },
        { name: "formatToParts", length: 1, implementation: function (value) {
            const state = dateFormatStates.get(this);
            if (!state) throw new TypeError("Intl.DateTimeFormat.prototype.formatToParts called on an incompatible receiver");
            return formatDateParts(state, value);
        } },
        { name: "formatRange", length: 2, implementation: function (start, end) {
            const state = dateFormatStates.get(this);
            if (!state) throw new TypeError("Intl.DateTimeFormat.prototype.formatRange called on an incompatible receiver");
            const range = dateRangeArguments(start, end);
            return bridgeResult(bridge.formatDate({ locale: state.locale, options: state.input, value: range.start, end: range.end })).text;
        } },
        { name: "formatRangeToParts", length: 2, implementation: function (start, end) {
            const state = dateFormatStates.get(this);
            if (!state) throw new TypeError("Intl.DateTimeFormat.prototype.formatRangeToParts called on an incompatible receiver");
            const range = dateRangeArguments(start, end);
            const result = bridgeResult(bridge.formatDate({ locale: state.locale, options: state.input, value: range.start, end: range.end }));
            return result.parts.map(function (part) { return { type: part.type, value: part.value, source: part.source }; });
        } }
    ], [
        { name: "format", implementation: function () {
            const state = dateFormatStates.get(this);
            if (!state) throw new TypeError("Intl.DateTimeFormat.prototype.format called on an incompatible receiver");
            if (state.boundFormat === undefined) {
                state.boundFormat = makeBoundFunction(1, function (value) { return formatDateValue(state, value); });
            }
            return state.boundFormat;
        } }
    ]);
    defineMethod(DateTimeFormat, "supportedLocalesOf", 1, function (locales, options) {
        return supportedLocalesOf(locales, options, "DateTimeFormat");
    });

    function resolvePluralRulesState(requested, options) {
        readLocaleMatcher(options);
        const type = asEnum(take(options, "type"), "type", ["cardinal", "ordinal"]) || "cardinal";
        const notation = asEnum(take(options, "notation"), "notation", ["standard", "scientific", "engineering", "compact"]) || "standard";
        const compactDisplay = asEnum(take(options, "compactDisplay"), "compactDisplay", ["short", "long"]);
        const digits = readDigitOptions(options);

        let defaultMaximumFraction = 3;
        if (notation === "compact") {
            defaultMaximumFraction = 0;
        }
        const resolvedDigits = resolveDigits(digits, 0, defaultMaximumFraction);
        const resolvedLocale = resolveLocale(requested, "PluralRules", {});

        const input = { type: type, notation: notation };
        if (compactDisplay !== undefined) input.compactDisplay = compactDisplay;
        const digitInput = digitsInput(digits);
        for (const key of Object.keys(digitInput)) input[key] = digitInput[key];

        const categories = toArray(bridgeResult(bridge.plural({ locale: resolvedLocale.locale, options: input, categories: true })).value);
        const resolved = { locale: resolvedLocale.locale, type: type, notation: notation };
        if (notation === "compact") {
            resolved.compactDisplay = compactDisplay === undefined ? "short" : compactDisplay;
        }
        addDigitsToResolved(resolved, resolvedDigits);
        resolved.pluralCategories = categories;

        return { locale: resolvedLocale.locale, input: input, resolved: resolved, categories: categories };
    }

    function pluralRulesNumber(value) {
        if (typeof value === "bigint") {
            return Number(value);
        }
        return toNumberValue(value);
    }

    function PluralRules(locales, options) {
        if (!new.target) {
            throw new TypeError("Constructor Intl.PluralRules requires 'new'");
        }
        const requested = canonicalizeLocaleList(locales);
        const parsedOptions = getOptionsObject(options, true);
        const instance = createInstance(new.target, PluralRules);
        pluralRulesStates.set(instance, resolvePluralRulesState(requested, parsedOptions));
        return instance;
    }

    installConstructor("PluralRules", PluralRules, 0, [
        { name: "resolvedOptions", length: 0, implementation: function () {
            const state = pluralRulesStates.get(this);
            if (!state) throw new TypeError("Intl.PluralRules.prototype.resolvedOptions called on an incompatible receiver");
            const result = copyObject(state.resolved);
            result.pluralCategories = state.categories.slice();
            return result;
        } },
        { name: "select", length: 1, implementation: function (value) {
            const state = pluralRulesStates.get(this);
            if (!state) throw new TypeError("Intl.PluralRules.prototype.select called on an incompatible receiver");
            const number = pluralRulesNumber(value);
            return bridgeResult(bridge.plural({ locale: state.locale, options: state.input, value: number })).value;
        } },
        { name: "selectRange", length: 2, implementation: function (start, end) {
            const state = pluralRulesStates.get(this);
            if (!state) throw new TypeError("Intl.PluralRules.prototype.selectRange called on an incompatible receiver");
            if (start === undefined || end === undefined) {
                throw new TypeError("Both range endpoints are required");
            }
            const startNumber = toNumberValue(start);
            const endNumber = toNumberValue(end);
            if (startNumber !== startNumber || endNumber !== endNumber) {
                throw new RangeError("Invalid range");
            }
            return bridgeResult(bridge.plural({ locale: state.locale, options: state.input, value: startNumber, end: endNumber })).value;
        } }
    ], []);
    defineMethod(PluralRules, "supportedLocalesOf", 1, function (locales, options) {
        return supportedLocalesOf(locales, options, "PluralRules");
    });

    function resolveRelativeTimeFormatState(requested, options) {
        readLocaleMatcher(options);
        const numberingSystemOption = asUnicodeType(take(options, "numberingSystem"), "numberingSystem");
        const style = asEnum(take(options, "style"), "style", ["long", "short", "narrow"]) || "long";
        const numeric = asEnum(take(options, "numeric"), "numeric", ["always", "auto"]) || "always";

        const keywordOptions = {};
        if (numberingSystemOption !== undefined) keywordOptions.numberingSystem = numberingSystemOption;
        const resolvedLocale = resolveLocale(requested, "RelativeTimeFormat", keywordOptions);
        const numberingSystem = numberingSystemOption !== undefined ? numberingSystemOption : (resolvedLocale.numberingSystem || resolvedLocale.defaultNumberingSystem);

        const input = { style: style, numeric: numeric };
        if (numberingSystemOption !== undefined) input.numberingSystem = numberingSystemOption;

        const resolved = { locale: resolvedLocale.locale, style: style, numeric: numeric, numberingSystem: numberingSystem };
        return { locale: resolvedLocale.locale, input: input, resolved: resolved };
    }

    const relativeUnits = ["year", "quarter", "month", "week", "day", "hour", "minute", "second"];

    function relativeArguments(value, unit) {
        const number = toNumberValue(value);
        if (!isFinite(number)) {
            throw new RangeError("Invalid relative time value");
        }
        let unitString = toStringValue(unit);
        if (unitString.endsWith("s")) {
            unitString = unitString.slice(0, -1);
        }
        if (relativeUnits.indexOf(unitString) === -1) {
            throw new RangeError("Invalid relative time unit");
        }
        return { value: number, unit: unitString };
    }

    function RelativeTimeFormat(locales, options) {
        if (!new.target) {
            throw new TypeError("Constructor Intl.RelativeTimeFormat requires 'new'");
        }
        const requested = canonicalizeLocaleList(locales);
        const parsedOptions = getOptionsObject(options, true);
        const instance = createInstance(new.target, RelativeTimeFormat);
        relativeTimeFormatStates.set(instance, resolveRelativeTimeFormatState(requested, parsedOptions));
        return instance;
    }

    installConstructor("RelativeTimeFormat", RelativeTimeFormat, 0, [
        { name: "resolvedOptions", length: 0, implementation: function () {
            const state = relativeTimeFormatStates.get(this);
            if (!state) throw new TypeError("Intl.RelativeTimeFormat.prototype.resolvedOptions called on an incompatible receiver");
            return copyObject(state.resolved);
        } },
        { name: "format", length: 2, implementation: function (value, unit) {
            const state = relativeTimeFormatStates.get(this);
            if (!state) throw new TypeError("Intl.RelativeTimeFormat.prototype.format called on an incompatible receiver");
            const parsed = relativeArguments(value, unit);
            return bridgeResult(bridge.formatRelative({ locale: state.locale, options: state.input, value: parsed.value, unit: parsed.unit })).text;
        } },
        { name: "formatToParts", length: 2, implementation: function (value, unit) {
            const state = relativeTimeFormatStates.get(this);
            if (!state) throw new TypeError("Intl.RelativeTimeFormat.prototype.formatToParts called on an incompatible receiver");
            const parsed = relativeArguments(value, unit);
            const result = bridgeResult(bridge.formatRelative({ locale: state.locale, options: state.input, value: parsed.value, unit: parsed.unit }));
            return result.parts.map(function (part) {
                if (part.type === "literal") {
                    return { type: part.type, value: part.value };
                }
                return { type: part.type, value: part.value, unit: part.unit };
            });
        } }
    ], []);
    defineMethod(RelativeTimeFormat, "supportedLocalesOf", 1, function (locales, options) {
        return supportedLocalesOf(locales, options, "RelativeTimeFormat");
    });

    function resolveListFormatState(requested, options) {
        readLocaleMatcher(options);
        const type = asEnum(take(options, "type"), "type", ["conjunction", "disjunction", "unit"]) || "conjunction";
        const style = asEnum(take(options, "style"), "style", ["long", "short", "narrow"]) || "long";
        const resolvedLocale = resolveLocale(requested, "ListFormat", {});
        const input = { type: type, style: style };
        const resolved = { locale: resolvedLocale.locale, type: type, style: style };
        return { locale: resolvedLocale.locale, input: input, resolved: resolved };
    }

    function iterableToList(value) {
        if (value === undefined) {
            return [];
        }
        if (value === null) {
            throw new TypeError("Value is not iterable");
        }
        const method = value[iteratorSymbol];
        if (typeof method !== "function") {
            throw new TypeError("Value is not iterable");
        }
        const iterator = method.call(value);
        if (!isObject(iterator)) {
            throw new TypeError("Iterator must be an object");
        }
        const result = [];
        while (true) {
            const step = iterator.next();
            if (!isObject(step)) {
                throw new TypeError("Iterator result must be an object");
            }
            if (step.done) {
                break;
            }
            if (typeof step.value !== "string") {
                if (iterator.return !== undefined) {
                    try {
                        iterator.return();
                    } catch (error) {
                        // The original type error takes precedence.
                    }
                }
                throw new TypeError("List elements must be strings");
            }
            result.push(step.value);
        }
        return result;
    }

    function ListFormat(locales, options) {
        if (!new.target) {
            throw new TypeError("Constructor Intl.ListFormat requires 'new'");
        }
        const requested = canonicalizeLocaleList(locales);
        const parsedOptions = getOptionsObject(options, false);
        const instance = createInstance(new.target, ListFormat);
        listFormatStates.set(instance, resolveListFormatState(requested, parsedOptions));
        return instance;
    }

    installConstructor("ListFormat", ListFormat, 0, [
        { name: "resolvedOptions", length: 0, implementation: function () {
            const state = listFormatStates.get(this);
            if (!state) throw new TypeError("Intl.ListFormat.prototype.resolvedOptions called on an incompatible receiver");
            return copyObject(state.resolved);
        } },
        { name: "format", length: 1, implementation: function (list) {
            const state = listFormatStates.get(this);
            if (!state) throw new TypeError("Intl.ListFormat.prototype.format called on an incompatible receiver");
            const items = iterableToList(list);
            return bridgeResult(bridge.formatList({ locale: state.locale, options: state.input, items: items })).text;
        } },
        { name: "formatToParts", length: 1, implementation: function (list) {
            const state = listFormatStates.get(this);
            if (!state) throw new TypeError("Intl.ListFormat.prototype.formatToParts called on an incompatible receiver");
            const items = iterableToList(list);
            const result = bridgeResult(bridge.formatList({ locale: state.locale, options: state.input, items: items }));
            return result.parts.map(function (part) { return { type: part.type, value: part.value }; });
        } }
    ], []);
    defineMethod(ListFormat, "supportedLocalesOf", 1, function (locales, options) {
        return supportedLocalesOf(locales, options, "ListFormat");
    });

    const displayNameTypes = ["language", "region", "script", "currency", "calendar", "dateTimeField"];
    const dateTimeFieldNames = ["era", "year", "quarter", "month", "weekOfYear", "weekday", "day", "dayPeriod", "hour", "minute", "second", "timeZoneName"];

    function isDisplayLanguageCode(tag) {
        if (!isStructurallyValidLanguageTag(tag)) {
            return false;
        }
        const parts = tag.split("-");
        let index = 1;
        if (index < parts.length && /^[A-Za-z]{4}$/.test(parts[index])) {
            index++;
        }
        if (index < parts.length && (/^[A-Za-z]{2}$/.test(parts[index]) || /^[0-9]{3}$/.test(parts[index]))) {
            index++;
        }
        while (index < parts.length && isVariantSubtag(parts[index])) {
            index++;
        }
        return index === parts.length;
    }

    function resolveDisplayNamesState(requested, options) {
        readLocaleMatcher(options);
        const style = asEnum(take(options, "style"), "style", ["long", "short", "narrow"]) || "long";
        const type = asEnum(take(options, "type"), "type", displayNameTypes);
        if (type === undefined) {
            throw new TypeError("type is required");
        }
        const fallback = asEnum(take(options, "fallback"), "fallback", ["code", "none"]) || "code";
        const languageDisplay = asEnum(take(options, "languageDisplay"), "languageDisplay", ["dialect", "standard"]) || "dialect";
        const resolvedLocale = resolveLocale(requested, "DisplayNames", {});
        const input = { type: type, style: style, fallback: fallback, languageDisplay: languageDisplay };
        const resolved = { locale: resolvedLocale.locale, style: style, type: type, fallback: fallback };
        if (type === "language") {
            resolved.languageDisplay = languageDisplay;
        }
        return { locale: resolvedLocale.locale, input: input, resolved: resolved, type: type };
    }

    function displayNameOf(state, codeValue) {
        let code = toStringValue(codeValue);
        if (state.type === "language") {
            if (!isDisplayLanguageCode(code)) {
                throw new RangeError("Invalid language code");
            }
            code = canonicalizeRawTag(code);
        } else if (state.type === "region") {
            if (!/^([A-Za-z]{2}|[0-9]{3})$/.test(code)) {
                throw new RangeError("Invalid region code");
            }
            code = code.toUpperCase();
        } else if (state.type === "script") {
            if (!/^[A-Za-z]{4}$/.test(code)) {
                throw new RangeError("Invalid script code");
            }
            code = code.charAt(0).toUpperCase() + code.slice(1).toLowerCase();
        } else if (state.type === "currency") {
            if (!/^[A-Za-z]{3}$/.test(code)) {
                throw new RangeError("Invalid currency code");
            }
            code = code.toUpperCase();
        } else if (state.type === "calendar") {
            code = code.toLowerCase();
            if (!/^[A-Za-z0-9]{3,8}(?:-[A-Za-z0-9]{3,8})*$/.test(code)) {
                throw new RangeError("Invalid calendar code");
            }
        } else if (state.type === "dateTimeField") {
            if (dateTimeFieldNames.indexOf(code) === -1) {
                throw new RangeError("Invalid dateTimeField code");
            }
        }
        const result = bridgeResult(bridge.displayName({ locale: state.locale, options: state.input, code: code }));
        return result.found ? result.value : undefined;
    }

    function DisplayNames(locales, options) {
        if (!new.target) {
            throw new TypeError("Constructor Intl.DisplayNames requires 'new'");
        }
        const requested = canonicalizeLocaleList(locales);
        const parsedOptions = getOptionsObject(options, false);
        const instance = createInstance(new.target, DisplayNames);
        displayNamesStates.set(instance, resolveDisplayNamesState(requested, parsedOptions));
        return instance;
    }

    installConstructor("DisplayNames", DisplayNames, 2, [
        { name: "resolvedOptions", length: 0, implementation: function () {
            const state = displayNamesStates.get(this);
            if (!state) throw new TypeError("Intl.DisplayNames.prototype.resolvedOptions called on an incompatible receiver");
            return copyObject(state.resolved);
        } },
        { name: "of", length: 1, implementation: function (code) {
            const state = displayNamesStates.get(this);
            if (!state) throw new TypeError("Intl.DisplayNames.prototype.of called on an incompatible receiver");
            return displayNameOf(state, code);
        } }
    ], []);
    defineMethod(DisplayNames, "supportedLocalesOf", 1, function (locales, options) {
        return supportedLocalesOf(locales, options, "DisplayNames");
    });

    function resolveSegmenterState(requested, options) {
        readLocaleMatcher(options);
        const granularity = asEnum(take(options, "granularity"), "granularity", ["grapheme", "word", "sentence"]) || "grapheme";
        const resolvedLocale = resolveLocale(requested, "Segmenter", {});
        const input = { granularity: granularity };
        const resolved = { locale: resolvedLocale.locale, granularity: granularity };
        return { locale: resolvedLocale.locale, input: input, resolved: resolved, granularity: granularity };
    }

    function makeSegmentRecord(part, word) {
        const record = { segment: part.segment, index: part.index, input: part.input };
        if (word) {
            record.isWordLike = !!part.isWordLike;
        }
        return record;
    }

    function copySegmentRecord(record, word) {
        const copy = { segment: record.segment, index: record.index, input: record.input };
        if (word) {
            copy.isWordLike = record.isWordLike;
        }
        return copy;
    }

    function Segments(input, records, word) {
        segmentsStates.set(this, { input: input, records: records, word: word });
    }

    defineMethod(Segments.prototype, "containing", 1, function (index) {
        const state = segmentsStates.get(this);
        if (!state) throw new TypeError("Intl.Segments.prototype.containing called on an incompatible receiver");
        const position = toIntegerOrInfinity(index);
        if (position < 0 || position >= state.input.length) {
            return undefined;
        }
        for (let offset = 0; offset < state.records.length; offset++) {
            const record = state.records[offset];
            if (record.index <= position && position < record.index + record.segment.length) {
                return copySegmentRecord(record, state.word);
            }
        }
        return undefined;
    });

    defineMethod(Segments.prototype, iteratorSymbol, 0, function () {
        const state = segmentsStates.get(this);
        if (!state) throw new TypeError("Intl.Segments.prototype[Symbol.iterator] called on an incompatible receiver");
        return new SegmentsIterator(state.records, state.word);
    });

    function SegmentsIterator(records, word) {
        segmentIteratorStates.set(this, { records: records, word: word, index: 0 });
    }

    defineMethod(SegmentsIterator.prototype, "next", 0, function () {
        const state = segmentIteratorStates.get(this);
        if (!state) throw new TypeError("Intl.Segmenter String Iterator.prototype.next called on an incompatible receiver");
        if (state.index >= state.records.length) {
            return { value: undefined, done: true };
        }
        const value = copySegmentRecord(state.records[state.index], state.word);
        state.index++;
        return { value: value, done: false };
    });

    defineMethod(SegmentsIterator.prototype, iteratorSymbol, 0, function () {
        if (!segmentIteratorStates.has(this)) {
            throw new TypeError("Intl.Segmenter String Iterator.prototype[Symbol.iterator] called on an incompatible receiver");
        }
        return this;
    });

    Object.defineProperty(SegmentsIterator.prototype, toStringTag, { value: "Segmenter String Iterator", writable: false, enumerable: false, configurable: true });

    function Segmenter(locales, options) {
        if (!new.target) {
            throw new TypeError("Constructor Intl.Segmenter requires 'new'");
        }
        const requested = canonicalizeLocaleList(locales);
        const parsedOptions = getOptionsObject(options, false);
        const instance = createInstance(new.target, Segmenter);
        segmenterStates.set(instance, resolveSegmenterState(requested, parsedOptions));
        return instance;
    }

    installConstructor("Segmenter", Segmenter, 0, [
        { name: "resolvedOptions", length: 0, implementation: function () {
            const state = segmenterStates.get(this);
            if (!state) throw new TypeError("Intl.Segmenter.prototype.resolvedOptions called on an incompatible receiver");
            return copyObject(state.resolved);
        } },
        { name: "segment", length: 1, implementation: function (value) {
            const state = segmenterStates.get(this);
            if (!state) throw new TypeError("Intl.Segmenter.prototype.segment called on an incompatible receiver");
            const input = toStringValue(value);
            const result = bridgeResult(bridge.segment({ locale: state.locale, granularity: state.granularity, input: input }));
            const records = result.segments.map(function (part) { return makeSegmentRecord(part, state.granularity === "word"); });
            return new Segments(input, records, state.granularity === "word");
        } }
    ], []);
    defineMethod(Segmenter, "supportedLocalesOf", 1, function (locales, options) {
        return supportedLocalesOf(locales, options, "Segmenter");
    });

    const durationUnits = ["years", "months", "weeks", "days", "hours", "minutes", "seconds", "milliseconds", "microseconds", "nanoseconds"];
    const durationTextualStyles = ["long", "short", "narrow"];
    const durationNumericStyles = ["numeric", "2-digit", "long", "short", "narrow"];

    function durationUnitAllowed(unit) {
        if (unit === "hours" || unit === "minutes" || unit === "seconds") {
            return durationNumericStyles;
        }
        return durationTextualStyles;
    }

    function isNumericDurationStyle(style) {
        return style === "numeric" || style === "2-digit";
    }

    function resolveDurationFormatState(requested, options) {
        readLocaleMatcher(options);
        const numberingSystemOption = asUnicodeType(take(options, "numberingSystem"), "numberingSystem");
        const style = asEnum(take(options, "style"), "style", ["long", "short", "narrow", "digital"]) || "short";

        const unitOptions = {};
        const displayOptions = {};
        for (const unit of durationUnits) {
            const unitRaw = take(options, unit);
            const displayRaw = take(options, unit + "Display");
            if (unitRaw !== undefined) {
                const value = toStringValue(unitRaw);
                if (durationUnitAllowed(unit).indexOf(value) === -1) {
                    throw new RangeError("Invalid value for option " + unit);
                }
                unitOptions[unit] = value;
            }
            if (displayRaw !== undefined) {
                const value = toStringValue(displayRaw);
                if (value !== "always" && value !== "auto") {
                    throw new RangeError("Invalid value for option " + unit + "Display");
                }
                displayOptions[unit] = value;
            }
        }
        const fractionalDigits = asInteger(take(options, "fractionalDigits"), "fractionalDigits", 0, 9);

        if (unitOptions.hours !== undefined && isNumericDurationStyle(unitOptions.hours)) {
            if (unitOptions.minutes !== undefined && !isNumericDurationStyle(unitOptions.minutes)) {
                throw new RangeError("hours and minutes styles are incompatible");
            }
            if (unitOptions.seconds !== undefined && !isNumericDurationStyle(unitOptions.seconds)) {
                throw new RangeError("hours and seconds styles are incompatible");
            }
        }
        if (unitOptions.minutes !== undefined && isNumericDurationStyle(unitOptions.minutes) && unitOptions.seconds !== undefined && !isNumericDurationStyle(unitOptions.seconds)) {
            throw new RangeError("minutes and seconds styles are incompatible");
        }
        if (isNumericDurationStyle(unitOptions.hours) || isNumericDurationStyle(unitOptions.minutes) || isNumericDurationStyle(unitOptions.seconds)) {
            if (unitOptions.milliseconds !== undefined || unitOptions.microseconds !== undefined || unitOptions.nanoseconds !== undefined) {
                throw new RangeError("Sub-second units cannot be used with numeric hour, minute or second styles");
            }
        }

        const keywordOptions = {};
        if (numberingSystemOption !== undefined) keywordOptions.numberingSystem = numberingSystemOption;
        const resolvedLocale = resolveLocale(requested, "DurationFormat", keywordOptions);
        const numberingSystem = numberingSystemOption !== undefined ? numberingSystemOption : (resolvedLocale.numberingSystem || resolvedLocale.defaultNumberingSystem);

        const input = { style: style };
        if (numberingSystemOption !== undefined) input.numberingSystem = numberingSystemOption;
        for (const unit of durationUnits) {
            if (unitOptions[unit] !== undefined) input[unit] = unitOptions[unit];
            if (displayOptions[unit] !== undefined) input[unit + "Display"] = displayOptions[unit];
        }
        if (fractionalDigits !== undefined) input.fractionalDigits = fractionalDigits;

        const resolved = { locale: resolvedLocale.locale, numberingSystem: numberingSystem, style: style };
        for (const unit of durationUnits) {
            let unitStyle = unitOptions[unit];
            if (unitStyle === undefined) {
                if (style === "digital") {
                    unitStyle = unit === "hours" ? "numeric" : (unit === "minutes" || unit === "seconds") ? "2-digit" : style;
                } else {
                    unitStyle = style;
                }
            }
            let display = displayOptions[unit];
            if (display === undefined) {
                if (style === "digital" && (unit === "hours" || unit === "minutes" || unit === "seconds")) {
                    display = "always";
                } else {
                    display = unitOptions[unit] !== undefined ? "always" : "auto";
                }
            }
            resolved[unit] = unitStyle;
            resolved[unit + "Display"] = display;
        }
        if (fractionalDigits !== undefined) {
            resolved.fractionalDigits = fractionalDigits;
        }
        return { locale: resolvedLocale.locale, input: input, resolved: resolved };
    }

    function readDurationRecord(value) {
        if (typeof value === "string") {
            throw new RangeError("Invalid duration string");
        }
        if (!isObject(value)) {
            throw new TypeError("Duration must be an object");
        }
        const keys = ["days", "hours", "microseconds", "milliseconds", "minutes", "months", "nanoseconds", "seconds", "weeks", "years"];
        const record = {};
        let any = false;
        for (const key of keys) {
            const raw = value[key];
            if (raw !== undefined) {
                any = true;
                const number = toNumberValue(raw);
                if (!isFinite(number) || Math.trunc(number) !== number) {
                    throw new RangeError("Invalid duration value");
                }
                record[key] = number;
            }
        }
        if (!any) {
            throw new TypeError("Duration record must contain at least one unit");
        }
        for (const key of ["years", "months", "weeks"]) {
            if (record[key] !== undefined && Math.abs(record[key]) >= 4294967296) {
                throw new RangeError("Duration value out of range");
            }
        }
        for (const key of ["days", "hours", "minutes", "seconds", "milliseconds", "microseconds", "nanoseconds"]) {
            if (record[key] !== undefined && Math.abs(record[key]) >= 9007199254740992) {
                throw new RangeError("Duration value out of range");
            }
        }
        let sign = 0;
        for (const key of keys) {
            const number = record[key];
            if (number !== undefined && number !== 0) {
                const current = number < 0 ? -1 : 1;
                if (sign !== 0 && sign !== current) {
                    throw new RangeError("Duration values must have the same sign");
                }
                sign = current;
            }
        }
        return record;
    }

    function durationParts(parts, withUnit) {
        return parts.map(function (part) {
            if (withUnit && part.unit !== undefined) {
                return { type: part.type, value: part.value, unit: part.unit };
            }
            return { type: part.type, value: part.value };
        });
    }

    function DurationFormat(locales, options) {
        if (!new.target) {
            throw new TypeError("Constructor Intl.DurationFormat requires 'new'");
        }
        const requested = canonicalizeLocaleList(locales);
        const parsedOptions = getOptionsObject(options, false);
        const instance = createInstance(new.target, DurationFormat);
        durationFormatStates.set(instance, resolveDurationFormatState(requested, parsedOptions));
        return instance;
    }

    installConstructor("DurationFormat", DurationFormat, 0, [
        { name: "resolvedOptions", length: 0, implementation: function () {
            const state = durationFormatStates.get(this);
            if (!state) throw new TypeError("Intl.DurationFormat.prototype.resolvedOptions called on an incompatible receiver");
            return copyObject(state.resolved);
        } },
        { name: "format", length: 1, implementation: function (duration) {
            const state = durationFormatStates.get(this);
            if (!state) throw new TypeError("Intl.DurationFormat.prototype.format called on an incompatible receiver");
            const record = readDurationRecord(duration);
            return bridgeResult(bridge.formatDuration({ locale: state.locale, options: state.input, duration: record })).text;
        } },
        { name: "formatToParts", length: 1, implementation: function (duration) {
            const state = durationFormatStates.get(this);
            if (!state) throw new TypeError("Intl.DurationFormat.prototype.formatToParts called on an incompatible receiver");
            const record = readDurationRecord(duration);
            const result = bridgeResult(bridge.formatDuration({ locale: state.locale, options: state.input, duration: record }));
            return durationParts(result.parts || [], true);
        } }
    ], []);
    defineMethod(DurationFormat, "supportedLocalesOf", 1, function (locales, options) {
        return supportedLocalesOf(locales, options, "DurationFormat");
    });

    function localePropertiesForTag(tag) {
        return bridgeResult(bridge.localeProperties({ tag: tag, options: {} }));
    }

    function resolveLocaleState(tag, options) {
        const canonicalTag = canonicalizeRawTag(tag);
        const optionMap = {};
        const language = asLanguageSubtag(take(options, "language"));
        if (language !== undefined) optionMap.language = language;
        const scriptRaw = take(options, "script");
        if (scriptRaw !== undefined) {
            const script = toStringValue(scriptRaw);
            if (!/^[A-Za-z]{4}$/.test(script)) {
                throw new RangeError("Invalid script");
            }
            optionMap.script = script.charAt(0).toUpperCase() + script.slice(1).toLowerCase();
        }
        const regionRaw = take(options, "region");
        if (regionRaw !== undefined) {
            const region = toStringValue(regionRaw);
            if (!/^([A-Za-z]{2}|[0-9]{3})$/.test(region)) {
                throw new RangeError("Invalid region");
            }
            optionMap.region = region.toUpperCase();
        }
        const variantsRaw = take(options, "variants");
        if (variantsRaw !== undefined) {
            const variants = toStringValue(variantsRaw).split("-");
            const seen = new Set();
            for (const variant of variants) {
                if (!isVariantSubtag(variant)) {
                    throw new RangeError("Invalid variants");
                }
                const lower = variant.toLowerCase();
                if (seen.has(lower)) {
                    throw new RangeError("Duplicate variant");
                }
                seen.add(lower);
            }
            optionMap.variants = variants.join("-").toLowerCase();
        }
        const calendar = asUnicodeType(take(options, "calendar"), "calendar");
        if (calendar !== undefined) optionMap.calendar = calendar;
        const collation = asUnicodeType(take(options, "collation"), "collation");
        if (collation !== undefined) optionMap.collation = collation;
        const firstDayOfWeekRaw = take(options, "firstDayOfWeek");
        if (firstDayOfWeekRaw !== undefined) {
            const firstDayOfWeek = toStringValue(firstDayOfWeekRaw);
            if (!/^[0-7]$/.test(firstDayOfWeek) && !/^[A-Za-z0-9]{3,8}$/.test(firstDayOfWeek)) {
                throw new RangeError("Invalid firstDayOfWeek");
            }
            optionMap.firstDayOfWeek = /^[0-7]$/.test(firstDayOfWeek) ? firstDayOfWeek : firstDayOfWeek.toLowerCase();
        }
        const hourCycle = asEnum(take(options, "hourCycle"), "hourCycle", ["h11", "h12", "h23", "h24"]);
        if (hourCycle !== undefined) optionMap.hourCycle = hourCycle;
        const caseFirst = asEnum(take(options, "caseFirst"), "caseFirst", ["upper", "lower", "false"]);
        if (caseFirst !== undefined) optionMap.caseFirst = caseFirst;
        const numeric = asBoolean(take(options, "numeric"));
        if (numeric !== undefined) optionMap.numeric = numeric;
        const numberingSystem = asUnicodeType(take(options, "numberingSystem"), "numberingSystem");
        if (numberingSystem !== undefined) optionMap.numberingSystem = numberingSystem;

        const properties = bridgeResult(bridge.localeProperties({ tag: canonicalTag, options: optionMap }));
        return { tag: properties.tag, properties: properties };
    }

    function createLocaleFromState(state, newTarget) {
        const instance = createInstance(newTarget, Locale);
        localeStates.set(instance, state);
        return instance;
    }

    function Locale(tag, options) {
        if (!new.target) {
            throw new TypeError("Constructor Intl.Locale requires 'new'");
        }
        let tagValue;
        if (isLocaleObject(tag)) {
            tagValue = localeStates.get(tag).tag;
        } else if (typeof tag === "string") {
            tagValue = tag;
        } else if (isObject(tag)) {
            tagValue = toStringValue(tag);
        } else {
            throw new TypeError("Invalid locale");
        }
        const parsedOptions = getOptionsObject(options, false);
        return createLocaleFromState(resolveLocaleState(tagValue, parsedOptions), new.target);
    }

    function localeState(value) {
        const state = localeStates.get(value);
        if (!state) {
            throw new TypeError("Intl.Locale method called on an incompatible receiver");
        }
        return state;
    }

    installConstructor("Locale", Locale, 1, [
        { name: "toString", length: 0, implementation: function () {
            return localeState(this).tag;
        } },
        { name: "maximize", length: 0, implementation: function () {
            const state = localeState(this);
            return createLocaleFromState(localePropertiesForTag(state.properties.maximize), Locale);
        } },
        { name: "minimize", length: 0, implementation: function () {
            const state = localeState(this);
            return createLocaleFromState(localePropertiesForTag(state.properties.minimize), Locale);
        } },
        { name: "getCalendars", length: 0, implementation: function () {
            const state = localeState(this);
            return toArray(bridgeResult(bridge.localeInfo({ tag: state.tag })).calendars);
        } },
        { name: "getCollations", length: 0, implementation: function () {
            const state = localeState(this);
            return toArray(bridgeResult(bridge.localeInfo({ tag: state.tag })).collations);
        } },
        { name: "getHourCycles", length: 0, implementation: function () {
            const state = localeState(this);
            return [bridgeResult(bridge.localeInfo({ tag: state.tag })).preferredHourCycle];
        } },
        { name: "getNumberingSystems", length: 0, implementation: function () {
            const state = localeState(this);
            return toArray(bridgeResult(bridge.localeInfo({ tag: state.tag })).numberingSystems);
        } },
        { name: "getTimeZones", length: 0, implementation: function () {
            const state = localeState(this);
            const info = bridgeResult(bridge.localeInfo({ tag: state.tag }));
            return info.timeZones === undefined ? undefined : toArray(info.timeZones);
        } },
        { name: "getTextInfo", length: 0, implementation: function () {
            const state = localeState(this);
            const info = bridgeResult(bridge.localeInfo({ tag: state.tag })).textInfo;
            return { direction: info.direction };
        } },
        { name: "getWeekInfo", length: 0, implementation: function () {
            const state = localeState(this);
            const info = bridgeResult(bridge.localeInfo({ tag: state.tag })).weekInfo;
            return { firstDay: info.firstDay, weekend: toArray(info.weekend) };
        } }
    ], [
        { name: "baseName", implementation: function () { return localeState(this).properties.baseName; } },
        { name: "calendar", implementation: function () { return localeState(this).properties.calendar; } },
        { name: "caseFirst", implementation: function () { return localeState(this).properties.caseFirst; } },
        { name: "collation", implementation: function () { return localeState(this).properties.collation; } },
        { name: "firstDayOfWeek", implementation: function () { return localeState(this).properties.firstDayOfWeek; } },
        { name: "hourCycle", implementation: function () { return localeState(this).properties.hourCycle; } },
        { name: "language", implementation: function () { return localeState(this).properties.language; } },
        { name: "numberingSystem", implementation: function () { return localeState(this).properties.numberingSystem; } },
        { name: "numeric", implementation: function () { return localeState(this).properties.numeric; } },
        { name: "region", implementation: function () { return localeState(this).properties.region; } },
        { name: "script", implementation: function () { return localeState(this).properties.script; } },
        { name: "variants", implementation: function () { return localeState(this).properties.variants; } }
    ]);

    defineMethod(IntlObject, "getCanonicalLocales", 1, function (locales) {
        return canonicalizeLocaleList(locales);
    });

    defineMethod(IntlObject, "supportedValuesOf", 1, function (key) {
        const name = toStringValue(key);
        if (["calendar", "collation", "currency", "numberingSystem", "timeZone", "unit"].indexOf(name) === -1) {
            throw new RangeError("Invalid supportedValuesOf key");
        }
        return toArray(bridgeResult(bridge.supportedValuesOf(name)).values);
    });

    Object.defineProperty(IntlObject, toStringTag, { value: "Intl", writable: false, enumerable: false, configurable: true });

    function installLocaleBuiltins() {
        Object.defineProperty(Number.prototype, "toLocaleString", {
            value: function (locales, options) {
                const value = Number.prototype.valueOf.call(this);
                return new NumberFormat(locales, options).format(value);
            },
            writable: true,
            enumerable: false,
            configurable: true
        });

        if (typeof BigInt === "function") {
            Object.defineProperty(BigInt.prototype, "toLocaleString", {
                value: function (locales, options) {
                    const value = typeof this === "bigint" ? this : BigInt.prototype.valueOf.call(this);
                    return new NumberFormat(locales, options).format(value);
                },
                writable: true,
                enumerable: false,
                configurable: true
            });
        }

        Object.defineProperty(String.prototype, "localeCompare", {
            value: function (that, locales, options) {
                if (this === undefined || this === null) {
                    throw new TypeError("String.prototype.localeCompare called on null or undefined");
                }
                const left = String(this);
                const right = toStringValue(that);
                return new Collator(locales, options).compare(left, right);
            },
            writable: true,
            enumerable: false,
            configurable: true
        });

        for (const upper of [true, false]) {
            Object.defineProperty(String.prototype, upper ? "toLocaleUpperCase" : "toLocaleLowerCase", {
                value: function (locales) {
                    if (this === undefined || this === null) {
                        throw new TypeError("String locale case conversion called on null or undefined");
                    }
                    const input = String(this);
                    const requested = canonicalizeLocaleList(locales);
                    const localeTag = requested.length > 0 ? requested[0] : "";
                    return bridgeResult(bridge.caseMap({ locale: localeTag, upper: upper, input: input })).text;
                },
                writable: true,
                enumerable: false,
                configurable: true
            });
        }

        for (const mode of ["date", "time", "both"]) {
            const name = mode === "date" ? "toLocaleDateString" : mode === "time" ? "toLocaleTimeString" : "toLocaleString";
            Object.defineProperty(Date.prototype, name, {
                value: function (locales, options) {
                    const time = Date.prototype.getTime.call(this);
                    if (time !== time) {
                        return "Invalid Date";
                    }
                    const parsedOptions = options === undefined ? {} : getOptionsObject(options, true);
                    const timeStyle = take(parsedOptions, "timeStyle");
                    const dateStyle = take(parsedOptions, "dateStyle");
                    if (mode === "date" && timeStyle !== undefined) {
                        throw new TypeError("timeStyle is not allowed in toLocaleDateString");
                    }
                    if (mode === "time" && dateStyle !== undefined) {
                        throw new TypeError("dateStyle is not allowed in toLocaleTimeString");
                    }
                    const copy = {};
                    for (const key of Object.keys(parsedOptions)) {
                        copy[key] = parsedOptions[key];
                    }
                    const hasDate = ["weekday", "era", "year", "month", "day"].some(function (key) { return take(parsedOptions, key) !== undefined; });
                    const hasTime = ["dayPeriod", "hour", "minute", "second", "fractionalSecondDigits", "timeZoneName"].some(function (key) { return take(parsedOptions, key) !== undefined; });
                    if (mode !== "time" && dateStyle === undefined && !hasDate) {
                        copy.year = "numeric";
                        copy.month = "numeric";
                        copy.day = "numeric";
                    }
                    if (mode !== "date" && timeStyle === undefined && !hasTime) {
                        copy.hour = "numeric";
                        copy.minute = "numeric";
                        copy.second = "numeric";
                    }
                    return new DateTimeFormat(locales, copy).format(time);
                },
                writable: true,
                enumerable: false,
                configurable: true
            });
        }
    }

    installLocaleBuiltins();

    return IntlObject;
})