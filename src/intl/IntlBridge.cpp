#include "IntlBridge.h"

#include <QMap>
#include <QRegularExpression>
#include <QSet>
#include <QStringList>
#include <QVariantList>

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <functional>
#include <limits>
#include <memory>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include <unicode/brkiter.h>
#include <unicode/calendar.h>
#include <unicode/coll.h>
#include <unicode/currunit.h>
#include <unicode/datefmt.h>
#include <unicode/dtitvfmt.h>
#include <unicode/dtptngen.h>
#include <unicode/fieldpos.h>
#include <unicode/fpositer.h>
#include <unicode/formattedvalue.h>
#include <unicode/listformatter.h>
#include <unicode/locdspnm.h>
#include <unicode/localebuilder.h>
#include <unicode/locid.h>
#include <unicode/measfmt.h>
#include <unicode/measure.h>
#include <unicode/measunit.h>
#include <unicode/nounit.h>
#include <unicode/numberformatter.h>
#include <unicode/numberrangeformatter.h>
#include <unicode/numfmt.h>
#include <unicode/numsys.h>
#include <unicode/plurrule.h>
#include <unicode/reldatefmt.h>
#include <unicode/smpdtfmt.h>
#include <unicode/strenum.h>
#include <unicode/timezone.h>
#include <unicode/ubrk.h>
#include <unicode/ucal.h>
#include <unicode/ucol.h>
#include <unicode/ucurr.h>
#include <unicode/udat.h>
#include <unicode/uenum.h>
#include <unicode/uloc.h>
#include <unicode/unum.h>

namespace QJSEnginePolyfills::Internal {

    namespace {

        using Options = QVariantMap;
        using icu::UnicodeString;
        using icu::number::NumberFormatter;
        using icu::number::NumberRangeFormatter;
        using icu::number::Precision;

        QVariantMap errorResult(const QString &errorType, const QString &message) {
            QVariantMap result;
            result.insert(QStringLiteral("ok"), false);
            result.insert(QStringLiteral("errorType"), errorType);
            result.insert(QStringLiteral("error"), message);
            return result;
        }

        QVariantMap okResult() {
            QVariantMap result;
            result.insert(QStringLiteral("ok"), true);
            return result;
        }

        void check(UErrorCode status, const char *operation) {
            if (U_FAILURE(status)) {
                throw std::runtime_error(std::string(operation) + ": " + u_errorName(status));
            }
        }

        template<typename T>
        T &required(const std::unique_ptr<T> &pointer, UErrorCode status, const char *operation) {
            check(status, operation);
            if (!pointer) {
                throw std::runtime_error(std::string(operation) + ": null result");
            }
            return *pointer;
        }

        QString text(const UnicodeString &value) {
            return QString(reinterpret_cast<const QChar *>(value.getBuffer()), value.length());
        }

        UnicodeString unicode(const QString &value) {
            return UnicodeString(reinterpret_cast<const UChar *>(value.utf16()), static_cast<int32_t>(value.size()));
        }

        QString stringOption(const Options &options, const char *key, const char *fallback = "") {
            return options.value(QString::fromLatin1(key), QString::fromLatin1(fallback)).toString();
        }

        int intOption(const Options &options, const char *key, int fallback) {
            return options.value(QString::fromLatin1(key), fallback).toInt();
        }

        QVariantMap optionsOf(const Options &request) {
            return request.value(QStringLiteral("options")).toMap();
        }

        QStringList stringList(const QJSValue &value) {
            QStringList result;
            const QVariantList list = value.toVariant().toList();
            result.reserve(list.size());
            for (const QVariant &entry : list) {
                result.append(entry.toString());
            }
            return result;
        }

        icu::Locale locale(const QString &tag) {
            if (tag.isEmpty()) {
                return icu::Locale::getDefault();
            }
            UErrorCode status = U_ZERO_ERROR;
            auto result = icu::Locale::forLanguageTag(tag.toStdString(), status);
            check(status, "Locale::forLanguageTag");
            if (result.isBogus()) {
                throw std::runtime_error("Bogus ICU locale");
            }
            result.canonicalize(status);
            check(status, "Locale::canonicalize");
            return result;
        }

        QString tag(const icu::Locale &value) {
            UErrorCode status = U_ZERO_ERROR;
            const auto result = value.toLanguageTag<std::string>(status);
            check(status, "Locale::toLanguageTag");
            return QString::fromStdString(result);
        }

        icu::Locale withKeywords(icu::Locale result, const Options &options) {
            UErrorCode status = U_ZERO_ERROR;
            for (const auto &pair : {std::pair{"calendar", "ca"}, {"numberingSystem", "nu"}, {"collation", "co"}}) {
                const QString value = stringOption(options, pair.first);
                if (!value.isEmpty()) {
                    result.setUnicodeKeywordValue(pair.second, value.toStdString(), status);
                }
            }
            check(status, "Locale::setUnicodeKeywordValue");
            return result;
        }

        QString numberingSystem(const icu::Locale &loc) {
            UErrorCode status = U_ZERO_ERROR;
            std::unique_ptr<icu::NumberingSystem> system(icu::NumberingSystem::createInstance(loc, status));
            return QString::fromLatin1(required(system, status, "NumberingSystem::createInstance").getName());
        }

        QString keyword(const icu::Locale &loc, const char *key) {
            UErrorCode status = U_ZERO_ERROR;
            const auto value = loc.getUnicodeKeywordValue<std::string>(key, status);
            if (status == U_ILLEGAL_ARGUMENT_ERROR) {
                return {};
            }
            check(status, "Locale::getUnicodeKeywordValue");
            return QString::fromStdString(value);
        }

        void setKeyword(icu::Locale &loc, const char *key, const QString &value, UErrorCode &status) {
            if (!value.isEmpty()) {
                loc.setUnicodeKeywordValue(key, value.toStdString(), status);
            }
        }

        void applyResolvedKeywords(icu::Locale &loc, const Options &options) {
            UErrorCode status = U_ZERO_ERROR;
            for (const auto &pair : {std::pair{"calendar", "ca"}, {"collation", "co"}, {"hourCycle", "hc"}, {"caseFirst", "kf"}, {"numberingSystem", "nu"}}) {
                setKeyword(loc, pair.second, stringOption(options, pair.first), status);
            }
            if (options.contains(QStringLiteral("numeric"))) {
                setKeyword(loc, "kn", options.value(QStringLiteral("numeric")).toBool() ? QStringLiteral("true") : QStringLiteral("false"), status);
            }
            if (options.contains(QStringLiteral("firstDayOfWeek"))) {
                QString day = stringOption(options, "firstDayOfWeek");
                bool numeric = false;
                const int number = day.toInt(&numeric);
                const QStringList weekdays{QStringLiteral("sun"), QStringLiteral("mon"), QStringLiteral("tue"), QStringLiteral("wed"), QStringLiteral("thu"), QStringLiteral("fri"), QStringLiteral("sat"), QStringLiteral("sun")};
                if (numeric && number >= 0 && number <= 7) {
                    day = weekdays[number];
                }
                setKeyword(loc, "fw", day, status);
            }
            check(status, "Locale::setUnicodeKeywordValue(resolve)");
        }

        QStringList strings(UEnumeration *raw, UErrorCode &status) {
            std::unique_ptr<UEnumeration, decltype(&uenum_close)> enumeration(raw, uenum_close);
            check(status, "ICU enumeration");
            if (!enumeration) {
                throw std::runtime_error("Null ICU enumeration");
            }
            QStringList result;
            int32_t length = 0;
            while (const char *entry = uenum_next(enumeration.get(), &length, &status)) {
                result.append(QString::fromLatin1(entry, length));
            }
            check(status, "uenum_next");
            return result;
        }

        QStringList strings(icu::StringEnumeration *raw, UErrorCode &status) {
            std::unique_ptr<icu::StringEnumeration> enumeration(raw);
            required(enumeration, status, "ICU StringEnumeration");
            QStringList result;
            while (const UnicodeString *entry = enumeration->snext(status)) {
                result.append(text(*entry));
            }
            check(status, "StringEnumeration::snext");
            return result;
        }

        QStringList sortedUnique(QStringList result) {
            result.removeDuplicates();
            std::sort(result.begin(), result.end());
            return result;
        }

        QString unicodeType(const char *key, const QString &value) {
            const char *converted = uloc_toUnicodeLocaleType(key, value.toLatin1().constData());
            if (!converted) {
                throw std::runtime_error("ICU could not map locale keyword type");
            }
            return QString::fromLatin1(converted);
        }

        const QStringList sanctionedUnits = QStringLiteral("acre bit byte celsius centimeter day degree fahrenheit fluid-ounce foot gallon gigabit gigabyte gram hectare hour inch kilobit kilobyte kilogram kilometer liter megabit megabyte meter microsecond mile mile-scandinavian milliliter millimeter millisecond minute month nanosecond ounce percent petabyte pound second stone terabit terabyte week yard year").split(QLatin1Char(' '));

        icu::MeasureUnit measureUnit(const QString &identifier, UErrorCode &status) {
            return icu::MeasureUnit::forIdentifier(identifier.toStdString(), status);
        }

        QStringList keywordValues(const char *key, const icu::Locale &loc, bool commonlyUsed) {
            UErrorCode status = U_ZERO_ERROR;
            QStringList result = strings(ucal_getKeywordValuesForLocale(key, loc.getName(), commonlyUsed, &status), status);
            for (QString &entry : result) {
                entry = unicodeType(key, entry);
            }
            return result;
        }

        QVariant supportedValues(const QString &key) {
            UErrorCode status = U_ZERO_ERROR;
            QStringList result;
            if (key == QLatin1String("calendar")) {
                result = keywordValues("calendar", icu::Locale::getRoot(), false);
                if (result.contains(QStringLiteral("islamic-civil"))) {
                    result.append(QStringLiteral("islamicc"));
                }
                result.append(QStringLiteral("iso8601"));
            } else if (key == QLatin1String("collation")) {
                result = strings(ucol_getKeywordValues("collation", &status), status);
                for (QString &entry : result) {
                    entry = unicodeType("collation", entry);
                }
                result.removeAll(QStringLiteral("standard"));
                result.removeAll(QStringLiteral("search"));
            } else if (key == QLatin1String("currency")) {
                result = strings(ucurr_openISOCurrencies(UCURR_ALL, &status), status);
            } else if (key == QLatin1String("numberingSystem")) {
                const auto names = strings(icu::NumberingSystem::getAvailableNames(status), status);
                for (const QString &name : names) {
                    std::unique_ptr<icu::NumberingSystem> system(icu::NumberingSystem::createInstanceByName(name.toLatin1().constData(), status));
                    required(system, status, "NumberingSystem::createInstanceByName");
                    if (!system->isAlgorithmic() && system->getRadix() == 10) {
                        result.append(name);
                    }
                }
            } else if (key == QLatin1String("timeZone")) {
                result = strings(icu::TimeZone::createTimeZoneIDEnumeration(UCAL_ZONE_TYPE_CANONICAL_LOCATION, nullptr, nullptr, status), status);
                result.append(QStringLiteral("UTC"));
            } else if (key == QLatin1String("unit")) {
                for (const QString &unit : sanctionedUnits) {
                    measureUnit(unit, status);
                    check(status, "MeasureUnit::forIdentifier(Table 2)");
                    result.append(unit);
                }
            } else {
                throw std::runtime_error("Unknown supportedValues key");
            }
            return sortedUnique(result);
        }

        QSet<QString> availableLocales(const QString &service) {
            QSet<QString> available;
            int32_t count = uloc_countAvailable();
            if (service == QLatin1String("Collator")) {
                count = ucol_countAvailable();
            }
            if (service == QLatin1String("Segmenter")) {
                count = ubrk_countAvailable();
            }
            for (int32_t index = 0; index < count; ++index) {
                const char *id = service == QLatin1String("Collator") ? ucol_getAvailable(index) : service == QLatin1String("Segmenter") ? ubrk_getAvailable(index) : uloc_getAvailable(index);
                available.insert(tag(icu::Locale(id)));
            }
            return available;
        }

        QStringList lookupMatches(const QStringList &locales, const QString &service) {
            const QSet<QString> available = availableLocales(service);
            QStringList result;
            for (const QString &value : locales) {
                const QString canonical = tag(locale(value));
                if (result.contains(canonical)) {
                    continue;
                }
                QString candidate = canonical;
                const qsizetype extension = candidate.indexOf(QStringLiteral("-u-"));
                if (extension != -1) {
                    qsizetype end = extension + 3;
                    while (end < candidate.size()) {
                        const qsizetype next = candidate.indexOf(QLatin1Char('-'), end);
                        if (next == -1) {
                            end = candidate.size();
                            break;
                        }
                        if (next - end == 1) {
                            --end;
                            break;
                        }
                        end = next + 1;
                    }
                    candidate.remove(extension, end - extension);
                }
                while (!candidate.isEmpty() && !available.contains(candidate)) {
                    qsizetype cut = candidate.lastIndexOf(QLatin1Char('-'));
                    if (cut >= 2 && candidate[cut - 2] == QLatin1Char('-')) {
                        cut -= 2;
                    }
                    candidate = cut < 0 ? QString() : candidate.left(cut);
                }
                if (!candidate.isEmpty()) {
                    result.append(canonical);
                }
            }
            return result;
        }

        UNumberFormatRoundingMode roundingMode(const QString &name) {
            if (name == QLatin1String("ceil")) {
                return UNUM_ROUND_CEILING;
            }
            if (name == QLatin1String("floor")) {
                return UNUM_ROUND_FLOOR;
            }
            if (name == QLatin1String("expand")) {
                return UNUM_ROUND_UP;
            }
            if (name == QLatin1String("trunc")) {
                return UNUM_ROUND_DOWN;
            }
            if (name == QLatin1String("halfCeil")) {
                return UNUM_ROUND_HALF_CEILING;
            }
            if (name == QLatin1String("halfFloor")) {
                return UNUM_ROUND_HALF_FLOOR;
            }
            if (name == QLatin1String("halfTrunc")) {
                return UNUM_ROUND_HALFDOWN;
            }
            if (name == QLatin1String("halfEven")) {
                return UNUM_ROUND_HALFEVEN;
            }
            return UNUM_ROUND_HALFUP;
        }

        icu::number::UnlocalizedNumberFormatter numberFormatter(const Options &options, bool plural = false) {
            UErrorCode status = U_ZERO_ERROR;
            auto formatter = NumberFormatter::with().roundingMode(roundingMode(stringOption(options, "roundingMode", "halfExpand")));
            const QString style = stringOption(options, "style", "decimal");
            const QString notation = stringOption(options, "notation", "standard");
            int minDefault = 0;
            int maxDefault = plural ? 3 : style == QLatin1String("percent") ? 0 : 3;
            if (style == QLatin1String("currency")) {
                auto currency = unicode(stringOption(options, "currency").toUpper());
                formatter = formatter.unit(icu::CurrencyUnit(currency.getTerminatedBuffer(), status));
                if (notation == QLatin1String("standard")) {
                    minDefault = ucurr_getDefaultFractionDigits(currency.getTerminatedBuffer(), &status);
                    maxDefault = minDefault;
                }
            } else if (style == QLatin1String("percent")) {
                formatter = formatter.unit(icu::NoUnit::percent()).scale(icu::number::Scale::powerOfTen(2));
            } else if (style == QLatin1String("unit")) {
                formatter = formatter.unit(measureUnit(stringOption(options, "unit"), status));
            }
            check(status, "ICU number unit");

            const QString display = style == QLatin1String("currency") ? stringOption(options, "currencyDisplay", "symbol") : stringOption(options, "unitDisplay", "short");
            UNumberUnitWidth width = UNUM_UNIT_WIDTH_SHORT;
            if (display == QLatin1String("code")) {
                width = UNUM_UNIT_WIDTH_ISO_CODE;
            }
            if (display == QLatin1String("name") || display == QLatin1String("long")) {
                width = UNUM_UNIT_WIDTH_FULL_NAME;
            }
            if (display == QLatin1String("narrowSymbol") || display == QLatin1String("narrow")) {
                width = UNUM_UNIT_WIDTH_NARROW;
            }
            formatter = formatter.unitWidth(width);

            const int minimumFraction = intOption(options, "minimumFractionDigits", std::min(minDefault, intOption(options, "maximumFractionDigits", maxDefault)));
            const int maximumFraction = intOption(options, "maximumFractionDigits", std::max(maxDefault, minimumFraction));
            const int minimumSignificant = intOption(options, "minimumSignificantDigits", 1);
            const int maximumSignificant = intOption(options, "maximumSignificantDigits", 21);
            const bool significant = options.contains(QStringLiteral("minimumSignificantDigits")) || options.contains(QStringLiteral("maximumSignificantDigits"));
            const bool fractional = options.contains(QStringLiteral("minimumFractionDigits")) || options.contains(QStringLiteral("maximumFractionDigits"));
            const QString priority = stringOption(options, "roundingPriority", "auto");
            Precision precision = Precision::minMaxFraction(minimumFraction, maximumFraction);
            if (priority != QLatin1String("auto")) {
                precision = Precision::minMaxFraction(minimumFraction, maximumFraction).withSignificantDigits(minimumSignificant, maximumSignificant, priority == QLatin1String("morePrecision") ? UNUM_ROUNDING_PRIORITY_RELAXED : UNUM_ROUNDING_PRIORITY_STRICT);
            } else if (significant) {
                precision = Precision::minMaxSignificantDigits(minimumSignificant, maximumSignificant);
            } else if (notation == QLatin1String("compact") && !fractional) {
                precision = Precision::minMaxFraction(0, 0).withSignificantDigits(1, 2, UNUM_ROUNDING_PRIORITY_RELAXED);
            }
            const int increment = intOption(options, "roundingIncrement", 1);
            if (increment != 1) {
                precision = Precision::incrementExact(increment, -maximumFraction).withMinFraction(minimumFraction);
            }
            if (stringOption(options, "trailingZeroDisplay") == QLatin1String("stripIfInteger")) {
                precision = precision.trailingZeroDisplay(UNUM_TRAILING_ZERO_HIDE_IF_WHOLE);
            }
            formatter = formatter.precision(precision).integerWidth(icu::number::IntegerWidth::zeroFillTo(intOption(options, "minimumIntegerDigits", 1)));

            if (notation == QLatin1String("scientific")) {
                formatter = formatter.notation(icu::number::Notation::scientific());
            }
            if (notation == QLatin1String("engineering")) {
                formatter = formatter.notation(icu::number::Notation::engineering());
            }
            if (notation == QLatin1String("compact")) {
                formatter = formatter.notation(stringOption(options, "compactDisplay", "short") == QLatin1String("long") ? icu::number::Notation::compactLong() : icu::number::Notation::compactShort());
            }
            const QVariant grouping = options.value(QStringLiteral("useGrouping"));
            UNumberGroupingStrategy groupingStrategy = notation == QLatin1String("compact") ? UNUM_GROUPING_MIN2 : UNUM_GROUPING_AUTO;
            if (grouping.isValid()) {
                const QString value = grouping.toString();
                if (grouping.metaType().id() == QMetaType::Bool && !grouping.toBool()) {
                    groupingStrategy = UNUM_GROUPING_OFF;
                } else if (value == QLatin1String("always") || (grouping.metaType().id() == QMetaType::Bool && grouping.toBool())) {
                    groupingStrategy = UNUM_GROUPING_ON_ALIGNED;
                } else if (value == QLatin1String("min2")) {
                    groupingStrategy = UNUM_GROUPING_MIN2;
                } else if (value != QLatin1String("true") && value != QLatin1String("false")) {
                    groupingStrategy = UNUM_GROUPING_AUTO;
                }
            }
            formatter = formatter.grouping(groupingStrategy);
            const bool accounting = stringOption(options, "currencySign") == QLatin1String("accounting");
            const QString sign = stringOption(options, "signDisplay", "auto");
            UNumberSignDisplay signDisplay = accounting ? UNUM_SIGN_ACCOUNTING : UNUM_SIGN_AUTO;
            if (sign == QLatin1String("never")) {
                signDisplay = UNUM_SIGN_NEVER;
            }
            if (sign == QLatin1String("always")) {
                signDisplay = accounting ? UNUM_SIGN_ACCOUNTING_ALWAYS : UNUM_SIGN_ALWAYS;
            }
            if (sign == QLatin1String("exceptZero")) {
                signDisplay = accounting ? UNUM_SIGN_ACCOUNTING_EXCEPT_ZERO : UNUM_SIGN_EXCEPT_ZERO;
            }
            if (sign == QLatin1String("negative")) {
                signDisplay = accounting ? UNUM_SIGN_ACCOUNTING_NEGATIVE : UNUM_SIGN_NEGATIVE;
            }
            return formatter.sign(signDisplay);
        }

        struct Field {
            int category;
            int field;
            int begin;
            int end;
        };

        std::vector<Field> fields(const icu::FormattedValue &value, UErrorCode &status) {
            std::vector<Field> result;
            icu::ConstrainedFieldPosition position;
            while (value.nextPosition(position, status)) {
                result.push_back({position.getCategory(), position.getField(), position.getStart(), position.getLimit()});
            }
            check(status, "FormattedValue::nextPosition");
            return result;
        }

        QString numberField(int field, double value) {
            switch (field) {
            case UNUM_INTEGER_FIELD:
                return std::isnan(value) ? QStringLiteral("nan") : std::isinf(value) ? QStringLiteral("infinity") : QStringLiteral("integer");
            case UNUM_FRACTION_FIELD:
                return QStringLiteral("fraction");
            case UNUM_DECIMAL_SEPARATOR_FIELD:
                return QStringLiteral("decimal");
            case UNUM_GROUPING_SEPARATOR_FIELD:
                return QStringLiteral("group");
            case UNUM_CURRENCY_FIELD:
                return QStringLiteral("currency");
            case UNUM_PERCENT_FIELD:
                return QStringLiteral("percentSign");
            case UNUM_SIGN_FIELD:
                return std::signbit(value) ? QStringLiteral("minusSign") : QStringLiteral("plusSign");
            case UNUM_EXPONENT_FIELD:
                return QStringLiteral("exponentInteger");
            case UNUM_EXPONENT_SYMBOL_FIELD:
                return QStringLiteral("exponentSeparator");
            case UNUM_EXPONENT_SIGN_FIELD:
                return QStringLiteral("exponentMinusSign");
            case UNUM_MEASURE_UNIT_FIELD:
                return QStringLiteral("unit");
            case UNUM_COMPACT_FIELD:
                return QStringLiteral("compact");
            case UNUM_APPROXIMATELY_SIGN_FIELD:
                return QStringLiteral("approximatelySign");
            default:
                return QStringLiteral("literal");
            }
        }

        QString dateField(int field) {
            switch (field) {
            case UDAT_ERA_FIELD:
                return QStringLiteral("era");
            case UDAT_YEAR_FIELD:
            case UDAT_EXTENDED_YEAR_FIELD:
                return QStringLiteral("year");
            case UDAT_RELATED_YEAR_FIELD:
                return QStringLiteral("relatedYear");
            case UDAT_YEAR_NAME_FIELD:
                return QStringLiteral("yearName");
            case UDAT_MONTH_FIELD:
            case UDAT_STANDALONE_MONTH_FIELD:
                return QStringLiteral("month");
            case UDAT_DATE_FIELD:
                return QStringLiteral("day");
            case UDAT_DAY_OF_WEEK_FIELD:
            case UDAT_STANDALONE_DAY_FIELD:
            case UDAT_DOW_LOCAL_FIELD:
                return QStringLiteral("weekday");
            case UDAT_AM_PM_FIELD:
            case UDAT_AM_PM_MIDNIGHT_NOON_FIELD:
            case UDAT_FLEXIBLE_DAY_PERIOD_FIELD:
                return QStringLiteral("dayPeriod");
            case UDAT_HOUR_OF_DAY1_FIELD:
            case UDAT_HOUR_OF_DAY0_FIELD:
            case UDAT_HOUR1_FIELD:
            case UDAT_HOUR0_FIELD:
                return QStringLiteral("hour");
            case UDAT_MINUTE_FIELD:
                return QStringLiteral("minute");
            case UDAT_SECOND_FIELD:
                return QStringLiteral("second");
            case UDAT_FRACTIONAL_SECOND_FIELD:
                return QStringLiteral("fractionalSecond");
            case UDAT_TIMEZONE_FIELD:
            case UDAT_TIMEZONE_RFC_FIELD:
            case UDAT_TIMEZONE_GENERIC_FIELD:
            case UDAT_TIMEZONE_SPECIAL_FIELD:
            case UDAT_TIMEZONE_LOCALIZED_GMT_OFFSET_FIELD:
            case UDAT_TIMEZONE_ISO_FIELD:
            case UDAT_TIMEZONE_ISO_LOCAL_FIELD:
                return QStringLiteral("timeZoneName");
            default:
                return QStringLiteral("literal");
            }
        }

        QVariantMap formatted(const QString &output, const std::vector<Field> &positions, int category, const std::function<QString(int, int)> &type, int spanCategory = -1) {
            std::vector<int> boundaries{0, static_cast<int>(output.size())};
            for (const auto &field : positions) {
                if (field.category == category || field.category == spanCategory) {
                    boundaries.push_back(field.begin);
                    boundaries.push_back(field.end);
                }
            }
            std::sort(boundaries.begin(), boundaries.end());
            boundaries.erase(std::unique(boundaries.begin(), boundaries.end()), boundaries.end());
            QVariantList parts;
            for (size_t index = 1; index < boundaries.size(); ++index) {
                const int begin = boundaries[index - 1];
                const int end = boundaries[index];
                if (begin == end) {
                    continue;
                }
                QString name = QStringLiteral("literal");
                QString source = QStringLiteral("shared");
                int shortest = std::numeric_limits<int>::max();
                for (const auto &field : positions) {
                    if (field.begin <= begin && field.end >= end) {
                        if (field.category == spanCategory) {
                            source = field.field == 0 ? QStringLiteral("startRange") : QStringLiteral("endRange");
                        }
                        if (field.category == category && field.end - field.begin <= shortest) {
                            shortest = field.end - field.begin;
                            name = type(field.field, begin);
                        }
                    }
                }
                QVariantMap part{{QStringLiteral("type"), name}, {QStringLiteral("value"), output.mid(begin, end - begin)}};
                if (spanCategory != -1) {
                    part.insert(QStringLiteral("source"), source);
                }
                if (!parts.isEmpty() && category != UFIELD_CATEGORY_LIST) {
                    auto last = parts.last().toMap();
                    if (last.value(QStringLiteral("type")) == part.value(QStringLiteral("type")) && last.value(QStringLiteral("source")) == part.value(QStringLiteral("source"))) {
                        last[QStringLiteral("value")] = last.value(QStringLiteral("value")).toString() + part.value(QStringLiteral("value")).toString();
                        parts.last() = last;
                        continue;
                    }
                }
                parts.append(part);
            }
            QVariantMap result;
            result.insert(QStringLiteral("text"), output);
            result.insert(QStringLiteral("parts"), parts);
            return result;
        }

        QVariantMap number(const Options &request) {
            const auto options = optionsOf(request);
            const auto loc = withKeywords(locale(stringOption(request, "locale")), options);
            const auto formatter = numberFormatter(options);
            const bool withParts = request.value(QStringLiteral("parts"), true).toBool();
            const double value = request.contains(QStringLiteral("decimal")) ? stringOption(request, "decimal").toDouble() : request.value(QStringLiteral("value")).toDouble();
            UErrorCode status = U_ZERO_ERROR;
            if (request.contains(QStringLiteral("end"))) {
                const double end = request.value(QStringLiteral("end")).toDouble();
                const auto result = NumberRangeFormatter::with().numberFormatterBoth(formatter).identityFallback(UNUM_IDENTITY_FALLBACK_APPROXIMATELY).locale(loc).formatFormattableRange(icu::Formattable(value), icu::Formattable(end), status);
                const QString output = text(result.toString(status));
                if (!withParts) {
                    check(status, "NumberRangeFormatter");
                    return QVariantMap{{QStringLiteral("text"), output}};
                }
                const auto positions = fields(result, status);
                check(status, "NumberRangeFormatter");
                return formatted(output, positions, UFIELD_CATEGORY_NUMBER, [&](int field, int begin) {
                    double operand = value;
                    for (const auto &position : positions) {
                        if (position.category == UFIELD_CATEGORY_NUMBER_RANGE_SPAN && position.field == 1 && position.begin <= begin && begin < position.end) {
                            operand = end;
                        }
                    }
                    return numberField(field, operand);
                }, UFIELD_CATEGORY_NUMBER_RANGE_SPAN);
            }
            const auto localized = formatter.locale(loc);
            const auto result = request.contains(QStringLiteral("decimal")) ? localized.formatDecimal(stringOption(request, "decimal").toStdString(), status) : localized.formatDouble(value, status);
            const QString output = text(result.toString(status));
            if (!withParts) {
                check(status, "NumberFormatter");
                return QVariantMap{{QStringLiteral("text"), output}};
            }
            const auto positions = fields(result, status);
            check(status, "NumberFormatter");
            return formatted(output, positions, UFIELD_CATEGORY_NUMBER, [&](int field, int) { return numberField(field, value); });
        }

        QVariantMap numberDefaults(const Options &request) {
            UErrorCode status = U_ZERO_ERROR;
            const auto loc = locale(stringOption(request, "locale"));
            QVariantMap result{{QStringLiteral("numberingSystem"), numberingSystem(loc)}};
            if (request.contains(QStringLiteral("currency"))) {
                auto currency = unicode(stringOption(request, "currency"));
                result.insert(QStringLiteral("currencyDigits"), ucurr_getDefaultFractionDigits(currency.getTerminatedBuffer(), &status));
            }
            check(status, "ucurr_getDefaultFractionDigits");
            return result;
        }

        QVariant plural(const Options &request) {
            const auto options = optionsOf(request);
            const auto loc = locale(stringOption(request, "locale"));
            const auto formatter = numberFormatter(options, true);
            UErrorCode status = U_ZERO_ERROR;
            std::unique_ptr<icu::PluralRules> rules(icu::PluralRules::forLocale(loc, stringOption(options, "type", "cardinal") == QLatin1String("ordinal") ? UPLURAL_TYPE_ORDINAL : UPLURAL_TYPE_CARDINAL, status));
            required(rules, status, "PluralRules::forLocale");
            if (request.value(QStringLiteral("categories")).toBool()) {
                const auto keywords = strings(rules->getKeywords(status), status);
                QStringList ordered;
                for (const auto &keyword : {"zero", "one", "two", "few", "many", "other"}) {
                    if (keywords.contains(QString::fromLatin1(keyword))) {
                        ordered.append(QString::fromLatin1(keyword));
                    }
                }
                return ordered;
            }
            const double value = request.value(QStringLiteral("value")).toDouble();
            UnicodeString selected;
            if (request.contains(QStringLiteral("end"))) {
                const double end = request.value(QStringLiteral("end")).toDouble();
                const auto first = formatter.locale(loc).formatDouble(value, status);
                const auto last = formatter.locale(loc).formatDouble(end, status);
                if (first.toString(status) == last.toString(status)) {
                    selected = rules->select(first, status);
                } else {
                    const auto range = NumberRangeFormatter::with().numberFormatterBoth(formatter).locale(loc).formatFormattableRange(icu::Formattable(value), icu::Formattable(end), status);
                    selected = rules->select(range, status);
                }
            } else if (!std::isfinite(value)) {
                return QStringLiteral("other");
            } else {
                selected = rules->select(formatter.locale(loc).formatDouble(value, status), status);
            }
            check(status, "PluralRules::select");
            return text(selected);
        }

        QVariant collate(const Options &request) {
            const auto options = optionsOf(request);
            auto loc = withKeywords(locale(stringOption(request, "locale")), options);
            UErrorCode status = U_ZERO_ERROR;
            if (stringOption(options, "usage", "sort") == QLatin1String("search")) {
                loc.setUnicodeKeywordValue("co", "search", status);
            }
            std::unique_ptr<icu::Collator> collator(icu::Collator::createInstance(loc, status));
            required(collator, status, "Collator::createInstance");
            collator->setAttribute(UCOL_NORMALIZATION_MODE, UCOL_ON, status);
            const QString sensitivity = stringOption(options, "sensitivity", "variant");
            collator->setStrength(sensitivity == QLatin1String("base") || sensitivity == QLatin1String("case") ? icu::Collator::PRIMARY : sensitivity == QLatin1String("accent") ? icu::Collator::SECONDARY : icu::Collator::TERTIARY);
            collator->setAttribute(UCOL_CASE_LEVEL, sensitivity == QLatin1String("case") ? UCOL_ON : UCOL_OFF, status);
            if (options.contains(QStringLiteral("ignorePunctuation"))) {
                collator->setAttribute(UCOL_ALTERNATE_HANDLING, options.value(QStringLiteral("ignorePunctuation")).toBool() ? UCOL_SHIFTED : UCOL_NON_IGNORABLE, status);
            }
            if (options.contains(QStringLiteral("numeric"))) {
                collator->setAttribute(UCOL_NUMERIC_COLLATION, options.value(QStringLiteral("numeric")).toBool() ? UCOL_ON : UCOL_OFF, status);
            }
            const QString caseFirst = stringOption(options, "caseFirst");
            if (!caseFirst.isEmpty()) {
                collator->setAttribute(UCOL_CASE_FIRST, caseFirst == QLatin1String("upper") ? UCOL_UPPER_FIRST : caseFirst == QLatin1String("lower") ? UCOL_LOWER_FIRST : UCOL_OFF, status);
            }
            const int comparison = collator->compare(unicode(stringOption(request, "left")), unicode(stringOption(request, "right")), status);
            check(status, "Collator::compare");
            return comparison < 0 ? -1 : comparison > 0 ? 1 : 0;
        }

        QString hourCycle(UDateFormatHourCycle cycle) {
            switch (cycle) {
            case UDAT_HOUR_CYCLE_11:
                return QStringLiteral("h11");
            case UDAT_HOUR_CYCLE_12:
                return QStringLiteral("h12");
            case UDAT_HOUR_CYCLE_23:
                return QStringLiteral("h23");
            case UDAT_HOUR_CYCLE_24:
                return QStringLiteral("h24");
            default:
                throw std::runtime_error("Unknown ICU hour cycle");
            }
        }

        UnicodeString dateSkeleton(const Options &options) {
            QString result;
            const auto field = [&](const char *key, const std::initializer_list<std::pair<const char *, const char *>> &patterns) {
                const QString value = stringOption(options, key);
                for (const auto &pattern : patterns) {
                    if (value == QLatin1String(pattern.first)) {
                        result += QString::fromLatin1(pattern.second);
                    }
                }
            };
            field("weekday", {{"long", "EEEE"}, {"short", "EEE"}, {"narrow", "EEEEE"}});
            field("era", {{"long", "GGGG"}, {"short", "G"}, {"narrow", "GGGGG"}});
            field("year", {{"numeric", "y"}, {"2-digit", "yy"}});
            field("month", {{"numeric", "M"}, {"2-digit", "MM"}, {"long", "MMMM"}, {"short", "MMM"}, {"narrow", "MMMMM"}});
            field("day", {{"numeric", "d"}, {"2-digit", "dd"}});
            const QString hour = stringOption(options, "hour");
            if (!hour.isEmpty()) {
                const QString cycle = stringOption(options, "hourCycle");
                QString symbol = cycle == QLatin1String("h11") ? QStringLiteral("K") : cycle == QLatin1String("h12") ? QStringLiteral("h") : cycle == QLatin1String("h23") ? QStringLiteral("H") : cycle == QLatin1String("h24") ? QStringLiteral("k") : QStringLiteral("j");
                if (options.contains(QStringLiteral("hour12"))) {
                    symbol = options.value(QStringLiteral("hour12")).toBool() ? QStringLiteral("h") : QStringLiteral("H");
                }
                result += hour == QLatin1String("2-digit") ? symbol + symbol : symbol;
            }
            field("minute", {{"numeric", "m"}, {"2-digit", "mm"}});
            field("second", {{"numeric", "s"}, {"2-digit", "ss"}});
            field("dayPeriod", {{"long", "BBBB"}, {"short", "B"}, {"narrow", "BBBBB"}});
            if (options.contains(QStringLiteral("fractionalSecondDigits"))) {
                result += QString(intOption(options, "fractionalSecondDigits", 0), QLatin1Char('S'));
            }
            field("timeZoneName", {{"long", "zzzz"}, {"short", "z"}, {"shortOffset", "O"}, {"longOffset", "OOOO"}, {"shortGeneric", "v"}, {"longGeneric", "vvvv"}});
            if (result.isEmpty()) {
                result = QStringLiteral("yMd");
            }
            return unicode(result);
        }

        icu::DateFormat::EStyle dateStyle(const QString &style) {
            if (style == QLatin1String("full")) {
                return icu::DateFormat::kFull;
            }
            if (style == QLatin1String("long")) {
                return icu::DateFormat::kLong;
            }
            if (style == QLatin1String("medium")) {
                return icu::DateFormat::kMedium;
            }
            if (style == QLatin1String("short")) {
                return icu::DateFormat::kShort;
            }
            return icu::DateFormat::kNone;
        }

        std::unique_ptr<icu::TimeZone> timeZone(const Options &options) {
            const QString identifier = stringOption(options, "timeZone");
            if (identifier.isEmpty()) {
                return std::unique_ptr<icu::TimeZone>(icu::TimeZone::createDefault());
            }
            return std::unique_ptr<icu::TimeZone>(icu::TimeZone::createTimeZone(unicode(identifier.startsWith(QLatin1Char('+')) || identifier.startsWith(QLatin1Char('-')) ? QStringLiteral("GMT") + identifier : identifier)));
        }

        QVariantMap date(const Options &request) {
            const auto options = optionsOf(request);
            const auto loc = withKeywords(locale(stringOption(request, "locale")), options);
            UErrorCode status = U_ZERO_ERROR;
            std::unique_ptr<icu::DateTimePatternGenerator> generator(icu::DateTimePatternGenerator::createInstance(loc, status));
            required(generator, status, "DateTimePatternGenerator::createInstance");
            const auto zone = timeZone(options);
            std::unique_ptr<icu::DateFormat> formatter;
            UnicodeString skeleton = dateSkeleton(options);
            const auto dateWidth = dateStyle(stringOption(options, "dateStyle"));
            const auto timeWidth = dateStyle(stringOption(options, "timeStyle"));
            if (dateWidth != icu::DateFormat::kNone || timeWidth != icu::DateFormat::kNone) {
                formatter.reset(dateWidth == icu::DateFormat::kNone ? icu::DateFormat::createTimeInstance(timeWidth, loc) : timeWidth == icu::DateFormat::kNone ? icu::DateFormat::createDateInstance(dateWidth, loc) : icu::DateFormat::createDateTimeInstance(dateWidth, timeWidth, loc));
                auto *simple = dynamic_cast<icu::SimpleDateFormat *>(formatter.get());
                if (!simple) {
                    throw std::runtime_error("Expected SimpleDateFormat for style");
                }
                UnicodeString pattern;
                simple->toPattern(pattern);
                skeleton = generator->getSkeleton(pattern, status);
            } else {
                const UnicodeString pattern = generator->getBestPattern(skeleton, UDATPG_MATCH_HOUR_FIELD_LENGTH, status);
                formatter = std::make_unique<icu::SimpleDateFormat>(pattern, loc, status);
            }
            required(formatter, status, "DateFormat creation");
            formatter->setTimeZone(*zone);
            const double value = request.value(QStringLiteral("value")).toDouble();
            if (request.contains(QStringLiteral("end"))) {
                std::unique_ptr<icu::DateIntervalFormat> interval(icu::DateIntervalFormat::createInstance(skeleton, loc, status));
                required(interval, status, "DateIntervalFormat::createInstance");
                interval->setTimeZone(*zone);
                icu::DateInterval range(value, request.value(QStringLiteral("end")).toDouble());
                const auto result = interval->formatToValue(range, status);
                const QString output = text(result.toString(status));
                const auto positions = fields(result, status);
                check(status, "DateIntervalFormat::formatToValue");
                return formatted(output, positions, UFIELD_CATEGORY_DATE, [](int field, int) { return dateField(field); }, UFIELD_CATEGORY_DATE_INTERVAL_SPAN);
            }
            UnicodeString output;
            icu::FieldPositionIterator iterator;
            formatter->format(value, output, &iterator, status);
            check(status, "DateFormat::format");
            std::vector<Field> positions;
            icu::FieldPosition position;
            while (iterator.next(position)) {
                positions.push_back({UFIELD_CATEGORY_DATE, position.getField(), position.getBeginIndex(), position.getEndIndex()});
            }
            return formatted(text(output), positions, UFIELD_CATEGORY_DATE, [](int field, int) { return dateField(field); });
        }

        QVariantMap dateDefaults(const Options &request) {
            UErrorCode status = U_ZERO_ERROR;
            const auto loc = withKeywords(locale(stringOption(request, "locale")), optionsOf(request));
            const auto zone = timeZone(optionsOf(request));
            std::unique_ptr<icu::Calendar> calendar(icu::Calendar::createInstance(*zone, loc, status));
            required(calendar, status, "Calendar::createInstance");
            std::unique_ptr<icu::DateTimePatternGenerator> generator(icu::DateTimePatternGenerator::createInstance(loc, status));
            required(generator, status, "DateTimePatternGenerator::createInstance");
            QVariantMap result{{QStringLiteral("calendar"), unicodeType("calendar", QString::fromLatin1(calendar->getType()))}, {QStringLiteral("numberingSystem"), numberingSystem(loc)}, {QStringLiteral("hourCycle"), hourCycle(generator->getDefaultHourCycle(status))}};
            check(status, "DateTimePatternGenerator::getDefaultHourCycle");
            UnicodeString id;
            zone->getID(id);
            result.insert(QStringLiteral("timeZone"), text(id));
            return result;
        }

        QVariantMap list(const Options &request) {
            UErrorCode status = U_ZERO_ERROR;
            const auto options = optionsOf(request);
            const QString type = stringOption(options, "type", "conjunction");
            const QString style = stringOption(options, "style", "long");
            std::unique_ptr<icu::ListFormatter> formatter(icu::ListFormatter::createInstance(locale(stringOption(request, "locale")), type == QLatin1String("disjunction") ? ULISTFMT_TYPE_OR : type == QLatin1String("unit") ? ULISTFMT_TYPE_UNITS : ULISTFMT_TYPE_AND, style == QLatin1String("narrow") ? ULISTFMT_WIDTH_NARROW : style == QLatin1String("short") ? ULISTFMT_WIDTH_SHORT : ULISTFMT_WIDTH_WIDE, status));
            required(formatter, status, "ListFormatter::createInstance");
            std::vector<UnicodeString> items;
            QStringList itemStrings;
            for (const auto &item : request.value(QStringLiteral("items")).toList()) {
                items.push_back(unicode(item.toString()));
                itemStrings.append(item.toString());
            }
            const auto result = formatter->formatStringsToValue(items.data(), static_cast<int32_t>(items.size()), status);
            const QString output = text(result.toString(status));
            const auto positions = fields(result, status);
            check(status, "ListFormatter::formatStringsToValue");
            QVariantMap formattedResult = formatted(output, positions, UFIELD_CATEGORY_LIST, [](int field, int) { return field == ULISTFMT_ELEMENT_FIELD ? QStringLiteral("element") : QStringLiteral("literal"); });
            bool hasEmptyItem = false;
            for (const QString &item : itemStrings) {
                if (item.isEmpty()) {
                    hasEmptyItem = true;
                    break;
                }
            }
            if (hasEmptyItem) {
                const QVariantList original = formattedResult.value(QStringLiteral("parts")).toList();
                QVariantList rebuilt;
                qsizetype partIndex = 0;
                for (const QString &item : itemStrings) {
                    if (item.isEmpty()) {
                        rebuilt.append(QVariantMap{{QStringLiteral("type"), QStringLiteral("element")}, {QStringLiteral("value"), QString()}});
                        continue;
                    }
                    while (partIndex < original.size() && original[partIndex].toMap().value(QStringLiteral("type")).toString() != QLatin1String("element")) {
                        rebuilt.append(original[partIndex++]);
                    }
                    if (partIndex < original.size()) {
                        rebuilt.append(original[partIndex++]);
                    }
                }
                while (partIndex < original.size()) {
                    rebuilt.append(original[partIndex++]);
                }
                formattedResult.insert(QStringLiteral("parts"), rebuilt);
            }
            return formattedResult;
        }

        QVariantMap relative(const Options &request) {
            UErrorCode status = U_ZERO_ERROR;
            const auto options = optionsOf(request);
            const QString style = stringOption(options, "style", "long");
            icu::RelativeDateTimeFormatter formatter(withKeywords(locale(stringOption(request, "locale")), options), nullptr, style == QLatin1String("narrow") ? UDAT_STYLE_NARROW : style == QLatin1String("short") ? UDAT_STYLE_SHORT : UDAT_STYLE_LONG, UDISPCTX_CAPITALIZATION_NONE, status);
            QString unit = stringOption(request, "unit");
            if (unit.endsWith(QLatin1Char('s'))) {
                unit.chop(1);
            }
            const QMap<QString, URelativeDateTimeUnit> units{{QStringLiteral("year"), UDAT_REL_UNIT_YEAR}, {QStringLiteral("quarter"), UDAT_REL_UNIT_QUARTER}, {QStringLiteral("month"), UDAT_REL_UNIT_MONTH}, {QStringLiteral("week"), UDAT_REL_UNIT_WEEK}, {QStringLiteral("day"), UDAT_REL_UNIT_DAY}, {QStringLiteral("hour"), UDAT_REL_UNIT_HOUR}, {QStringLiteral("minute"), UDAT_REL_UNIT_MINUTE}, {QStringLiteral("second"), UDAT_REL_UNIT_SECOND}};
            if (!units.contains(unit)) {
                throw std::runtime_error("Unknown relative time unit");
            }
            const double value = request.value(QStringLiteral("value")).toDouble();
            const auto result = stringOption(options, "numeric", "always") == QLatin1String("auto") ? formatter.formatToValue(value, units.value(unit), status) : formatter.formatNumericToValue(value, units.value(unit), status);
            const QString output = text(result.toString(status));
            const auto positions = fields(result, status);
            check(status, "RelativeDateTimeFormatter");
            auto outputMap = formatted(output, positions, UFIELD_CATEGORY_NUMBER, [&](int field, int) { return numberField(field, std::abs(value)); });
            auto parts = outputMap.value(QStringLiteral("parts")).toList();
            for (auto &item : parts) {
                auto part = item.toMap();
                if (part.value(QStringLiteral("type")) != QStringLiteral("literal")) {
                    part.insert(QStringLiteral("unit"), unit);
                }
                item = part;
            }
            outputMap.insert(QStringLiteral("parts"), parts);
            return outputMap;
        }

        QVariantMap displayName(const Options &request) {
            const auto options = optionsOf(request);
            const auto loc = locale(stringOption(request, "locale"));
            const QString type = stringOption(options, "type");
            const QString style = stringOption(options, "style", "long");
            const bool substitute = stringOption(options, "fallback", "code") == QLatin1String("code");
            QString code = stringOption(request, "code");
            UDisplayContext contexts[] = {
                stringOption(options, "languageDisplay", "dialect") == QLatin1String("standard") ? UDISPCTX_STANDARD_NAMES : UDISPCTX_DIALECT_NAMES,
                style == QLatin1String("long") ? UDISPCTX_LENGTH_FULL : UDISPCTX_LENGTH_SHORT,
                substitute ? UDISPCTX_SUBSTITUTE : UDISPCTX_NO_SUBSTITUTE,
                UDISPCTX_CAPITALIZATION_FOR_STANDALONE
            };
            std::unique_ptr<icu::LocaleDisplayNames> names(icu::LocaleDisplayNames::createInstance(loc, contexts, 4));
            if (!names) {
                throw std::runtime_error("LocaleDisplayNames::createInstance: null result");
            }
            UnicodeString output;
            UErrorCode status = U_ZERO_ERROR;
            if (type == QLatin1String("language")) {
                const auto target = locale(code);
                names->localeDisplayName(target, output);
            } else if (type == QLatin1String("region")) {
                names->regionDisplayName(code.toUpper().toLatin1().constData(), output);
            } else if (type == QLatin1String("script")) {
                code = code.toLower();
                if (!code.isEmpty()) {
                    code[0] = code[0].toUpper();
                }
                names->scriptDisplayName(code.toLatin1().constData(), output);
            } else if (type == QLatin1String("calendar")) {
                const QString canonical = unicodeType("calendar", code.toLower());
                const char *legacy = uloc_toLegacyType("calendar", canonical.toLatin1().constData());
                if (!legacy) {
                    throw std::runtime_error("uloc_toLegacyType(calendar)");
                }
                names->keyValueDisplayName("calendar", legacy, output);
            } else if (type == QLatin1String("currency")) {
                auto currency = unicode(code.toUpper());
                UBool choice = false;
                int32_t length = 0;
                const UChar *name = ucurr_getName(currency.getTerminatedBuffer(), loc.getName(), UCURR_LONG_NAME, &choice, &length, &status);
                check(status, "ucurr_getName");
                output = UnicodeString(name, length);
                if (!substitute && text(output) == code.toUpper()) {
                    output.setToBogus();
                }
            } else if (type == QLatin1String("dateTimeField")) {
                const QMap<QString, UDateTimePatternField> fields{{QStringLiteral("era"), UDATPG_ERA_FIELD}, {QStringLiteral("year"), UDATPG_YEAR_FIELD}, {QStringLiteral("quarter"), UDATPG_QUARTER_FIELD}, {QStringLiteral("month"), UDATPG_MONTH_FIELD}, {QStringLiteral("weekOfYear"), UDATPG_WEEK_OF_YEAR_FIELD}, {QStringLiteral("weekday"), UDATPG_WEEKDAY_FIELD}, {QStringLiteral("day"), UDATPG_DAY_FIELD}, {QStringLiteral("dayPeriod"), UDATPG_DAYPERIOD_FIELD}, {QStringLiteral("hour"), UDATPG_HOUR_FIELD}, {QStringLiteral("minute"), UDATPG_MINUTE_FIELD}, {QStringLiteral("second"), UDATPG_SECOND_FIELD}, {QStringLiteral("timeZoneName"), UDATPG_ZONE_FIELD}};
                if (!fields.contains(code)) {
                    throw std::runtime_error("Unknown dateTimeField");
                }
                std::unique_ptr<icu::DateTimePatternGenerator> generator(icu::DateTimePatternGenerator::createInstance(loc, status));
                required(generator, status, "DateTimePatternGenerator::createInstance");
                output = generator->getFieldDisplayName(fields.value(code), style == QLatin1String("narrow") ? UDATPG_NARROW : style == QLatin1String("short") ? UDATPG_ABBREVIATED : UDATPG_WIDE);
            } else {
                throw std::runtime_error("Unknown DisplayNames type");
            }
            QVariantMap result;
            result.insert(QStringLiteral("found"), !output.isBogus());
            result.insert(QStringLiteral("value"), text(output));
            return result;
        }

        QVariant segments(const Options &request) {
            const auto loc = locale(stringOption(request, "locale"));
            const QString input = stringOption(request, "input");
            const QString granularity = stringOption(request, "granularity");
            UErrorCode status = U_ZERO_ERROR;
            std::unique_ptr<icu::BreakIterator> iterator(granularity == QLatin1String("word") ? icu::BreakIterator::createWordInstance(loc, status) : granularity == QLatin1String("sentence") ? icu::BreakIterator::createSentenceInstance(loc, status) : icu::BreakIterator::createCharacterInstance(loc, status));
            required(iterator, status, "BreakIterator::createInstance");
            const auto content = unicode(input);
            iterator->setText(content);
            QVariantList result;
            int32_t begin = iterator->first();
            for (int32_t end = iterator->next(); end != icu::BreakIterator::DONE; begin = end, end = iterator->next()) {
                QVariantMap part{{QStringLiteral("segment"), input.mid(begin, end - begin)}, {QStringLiteral("index"), begin}, {QStringLiteral("input"), input}};
                if (granularity == QLatin1String("word")) {
                    part.insert(QStringLiteral("isWordLike"), iterator->getRuleStatus() >= UBRK_WORD_NUMBER);
                }
                result.append(part);
            }
            return result;
        }

        icu::Locale localeWithOptions(const Options &request) {
            const auto options = optionsOf(request);
            icu::LocaleBuilder builder;
            builder.setLocale(locale(stringOption(request, "tag")));
            if (options.contains(QStringLiteral("language"))) {
                builder.setLanguage(stringOption(options, "language").toStdString());
            }
            if (options.contains(QStringLiteral("script"))) {
                builder.setScript(stringOption(options, "script").toStdString());
            }
            if (options.contains(QStringLiteral("region"))) {
                builder.setRegion(stringOption(options, "region").toStdString());
            }
            if (options.contains(QStringLiteral("variants"))) {
                builder.setVariant(stringOption(options, "variants").replace(QLatin1Char('-'), QLatin1Char('_')).toStdString());
            }
            for (const auto &pair : {std::pair{"calendar", "ca"}, {"collation", "co"}, {"hourCycle", "hc"}, {"caseFirst", "kf"}, {"numberingSystem", "nu"}}) {
                if (options.contains(QString::fromLatin1(pair.first))) {
                    builder.setUnicodeLocaleKeyword(pair.second, stringOption(options, pair.first).toStdString());
                }
            }
            if (options.contains(QStringLiteral("numeric"))) {
                builder.setUnicodeLocaleKeyword("kn", options.value(QStringLiteral("numeric")).toBool() ? "true" : "false");
            }
            if (options.contains(QStringLiteral("firstDayOfWeek"))) {
                QString day = stringOption(options, "firstDayOfWeek");
                const QStringList weekdays{QStringLiteral("sun"), QStringLiteral("mon"), QStringLiteral("tue"), QStringLiteral("wed"), QStringLiteral("thu"), QStringLiteral("fri"), QStringLiteral("sat"), QStringLiteral("sun")};
                bool numeric = false;
                const int number = day.toInt(&numeric);
                if (numeric && number >= 0 && number <= 7) {
                    day = weekdays[number];
                }
                builder.setUnicodeLocaleKeyword("fw", day.toStdString());
            }
            UErrorCode status = U_ZERO_ERROR;
            auto result = builder.build(status);
            check(status, "LocaleBuilder::build");
            result.canonicalize(status);
            check(status, "Locale::canonicalize(options)");
            return result;
        }

        QVariantMap localeProperties(const Options &request) {
            const auto loc = localeWithOptions(request);
            UErrorCode status = U_ZERO_ERROR;
            auto maximal = loc;
            maximal.addLikelySubtags(status);
            auto minimal = loc;
            minimal.minimizeSubtags(status);
            check(status, "Locale likely subtags");
            QVariantMap result{{QStringLiteral("tag"), tag(loc)}, {QStringLiteral("baseName"), tag(icu::Locale(loc.getBaseName()))}, {QStringLiteral("language"), QString::fromLatin1(loc.getLanguage()).isEmpty() ? QStringLiteral("und") : QString::fromLatin1(loc.getLanguage())}, {QStringLiteral("maximize"), tag(maximal)}, {QStringLiteral("minimize"), tag(minimal)}, {QStringLiteral("numeric"), keyword(loc, "kn") == QLatin1String("true")}};
            for (const auto &pair : {std::pair{"calendar", "ca"}, {"collation", "co"}, {"firstDayOfWeek", "fw"}, {"hourCycle", "hc"}, {"caseFirst", "kf"}, {"numberingSystem", "nu"}}) {
                const QString value = keyword(loc, pair.second);
                if (!value.isEmpty()) {
                    result.insert(QString::fromLatin1(pair.first), value);
                }
            }
            if (*loc.getScript()) {
                result.insert(QStringLiteral("script"), QString::fromLatin1(loc.getScript()));
            }
            if (*loc.getCountry()) {
                result.insert(QStringLiteral("region"), QString::fromLatin1(loc.getCountry()));
            }
            if (*loc.getVariant()) {
                result.insert(QStringLiteral("variants"), QString::fromLatin1(loc.getVariant()).toLower().replace(QLatin1Char('_'), QLatin1Char('-')));
            }
            return result;
        }

        QVariantMap localeInfo(const Options &request) {
            const auto loc = localeWithOptions(request);
            UErrorCode status = U_ZERO_ERROR;
            QVariantMap result;
            const QString calendar = keyword(loc, "ca");
            result.insert(QStringLiteral("calendars"), calendar.isEmpty() ? keywordValues("calendar", loc, true) : QStringList{calendar});
            const QString collation = keyword(loc, "co");
            QStringList collations;
            if (!collation.isEmpty()) {
                collations.append(collation);
            } else {
                collations = strings(ucol_getKeywordValuesForLocale("collation", loc.getName(), false, &status), status);
                for (QString &entry : collations) {
                    entry = unicodeType("collation", entry);
                }
                collations.removeAll(QStringLiteral("standard"));
                collations.removeAll(QStringLiteral("search"));
                collations = sortedUnique(collations);
            }
            result.insert(QStringLiteral("collations"), collations);
            const QString numberSystem = keyword(loc, "nu");
            result.insert(QStringLiteral("numberingSystems"), QStringList{numberSystem.isEmpty() ? numberingSystem(loc) : numberSystem});
            const QString cycle = keyword(loc, "hc");
            std::unique_ptr<icu::DateTimePatternGenerator> generator(icu::DateTimePatternGenerator::createInstance(loc, status));
            required(generator, status, "DateTimePatternGenerator::createInstance");
            result.insert(QStringLiteral("preferredHourCycle"), cycle.isEmpty() ? hourCycle(generator->getDefaultHourCycle(status)) : cycle);
            if (*loc.getCountry()) {
                result.insert(QStringLiteral("timeZones"), sortedUnique(strings(icu::TimeZone::createTimeZoneIDEnumeration(UCAL_ZONE_TYPE_CANONICAL_LOCATION, loc.getCountry(), nullptr, status), status)));
            }
            const auto direction = uloc_getCharacterOrientation(loc.getName(), &status);
            result.insert(QStringLiteral("textInfo"), QVariantMap{{QStringLiteral("direction"), direction == ULOC_LAYOUT_RTL ? QStringLiteral("rtl") : QStringLiteral("ltr")}});
            std::unique_ptr<icu::Calendar> weekCalendar(icu::Calendar::createInstance(loc, status));
            required(weekCalendar, status, "Calendar::createInstance(week)");
            const int firstDay = weekCalendar->getFirstDayOfWeek(status);
            int first = firstDay == UCAL_SUNDAY ? 7 : firstDay - 1;
            const QString fw = keyword(loc, "fw");
            const QStringList days{QStringLiteral("mon"), QStringLiteral("tue"), QStringLiteral("wed"), QStringLiteral("thu"), QStringLiteral("fri"), QStringLiteral("sat"), QStringLiteral("sun")};
            if (days.contains(fw)) {
                first = static_cast<int>(days.indexOf(fw)) + 1;
            }
            QVariantList weekend;
            for (int day = 1; day <= 7; ++day) {
                const auto icuDay = static_cast<UCalendarDaysOfWeek>(day == 7 ? UCAL_SUNDAY : day + 1);
                const auto type = weekCalendar->getDayOfWeekType(icuDay, status);
                if (type == UCAL_WEEKEND || type == UCAL_WEEKEND_ONSET || (type == UCAL_WEEKEND_CEASE && weekCalendar->getWeekendTransition(icuDay, status) > 0)) {
                    weekend.append(day);
                }
            }
            result.insert(QStringLiteral("weekInfo"), QVariantMap{{QStringLiteral("firstDay"), first}, {QStringLiteral("weekend"), weekend}});
            check(status, "Locale information");
            return result;
        }

        QVariantMap durationDigitalText(const Options &options, const Options &values, const QString &localeTag, UErrorCode &status) {
            const auto loc = withKeywords(locale(localeTag), options);
            icu::MeasureFormat formatter(loc, UMEASFMT_WIDTH_NUMERIC, status);
            check(status, "MeasureFormat::MeasureFormat");
            std::vector<icu::Measure> measures;
            for (const char *unit : {"hour", "minute", "second"}) {
                auto measure = measureUnit(QString::fromLatin1(unit), status);
                measures.emplace_back(icu::Formattable(values.value(QString::fromLatin1(unit) + QLatin1Char('s'), 0).toDouble()), measure.clone(), status);
            }
            UnicodeString output;
            icu::FieldPosition ignored(0);
            formatter.formatMeasures(measures.data(), static_cast<int32_t>(measures.size()), output, ignored, status);
            check(status, "MeasureFormat::formatMeasures(numeric)");
            const QString fullText = text(output);

            const auto integerText = [&](double value, int minimumDigits) {
                auto counter = NumberFormatter::withLocale(loc)
                    .precision(Precision::fixedFraction(0))
                    .integerWidth(icu::number::IntegerWidth::zeroFillTo(minimumDigits))
                    .grouping(UNUM_GROUPING_OFF)
                    .roundingMode(UNUM_ROUND_DOWN);
                return text(counter.formatDouble(value, status).toString(status));
            };

            QVariantList parts;
            int position = 0;
            const std::pair<const char *, int> components[] = {{"hour", 1}, {"minute", 2}, {"second", 2}};
            bool failed = false;
            for (const auto &component : components) {
                const QString unit = QString::fromLatin1(component.first);
                const QString componentText = integerText(values.value(unit + QLatin1Char('s'), 0).toDouble(), component.second);
                const int found = fullText.indexOf(componentText, position);
                if (found < 0) {
                    failed = true;
                    break;
                }
                if (found > position) {
                    parts.append(QVariantMap{{QStringLiteral("type"), QStringLiteral("literal")}, {QStringLiteral("value"), fullText.mid(position, found - position)}});
                }
                parts.append(QVariantMap{{QStringLiteral("type"), QStringLiteral("integer")}, {QStringLiteral("value"), componentText}, {QStringLiteral("unit"), unit}});
                position = found + componentText.length();
            }
            if (failed) {
                parts.clear();
                parts.append(QVariantMap{{QStringLiteral("type"), QStringLiteral("literal")}, {QStringLiteral("value"), fullText}});
            } else if (position < fullText.size()) {
                parts.append(QVariantMap{{QStringLiteral("type"), QStringLiteral("literal")}, {QStringLiteral("value"), fullText.mid(position)}});
            }

            QVariantMap result;
            result.insert(QStringLiteral("text"), fullText);
            result.insert(QStringLiteral("parts"), parts);
            return result;
        }

        QVariantMap durationDigitalFractional(const Options &options, const Options &values, const QString &localeTag, UErrorCode &status) {
            const auto loc = withKeywords(locale(localeTag), options);
            const int digits = intOption(options, "fractionalDigits", 0);

            const double secondsValue = values.value(QStringLiteral("seconds"), 0).toDouble();
            const double milliseconds = values.value(QStringLiteral("milliseconds"), 0).toDouble();
            const double microseconds = values.value(QStringLiteral("microseconds"), 0).toDouble();
            const double nanoseconds = values.value(QStringLiteral("nanoseconds"), 0).toDouble();
            const bool negative = std::signbit(secondsValue) || std::signbit(milliseconds) || std::signbit(microseconds) || std::signbit(nanoseconds);
            const long long wholeSeconds = static_cast<long long>(std::llabs(static_cast<long long>(std::llround(secondsValue))));
            long long subNanoseconds = std::llabs(static_cast<long long>(std::llround(milliseconds))) * 1000000LL + std::llabs(static_cast<long long>(std::llround(microseconds))) * 1000LL + std::llabs(static_cast<long long>(std::llround(nanoseconds)));
            long long normalizedSeconds = wholeSeconds + subNanoseconds / 1000000000LL;
            subNanoseconds %= 1000000000LL;

            QString fraction = QString::number(subNanoseconds).rightJustified(9, QLatin1Char('0'));
            if (digits < 9) {
                fraction = fraction.left(digits);
            } else if (digits > 9) {
                fraction += QString(digits - 9, QLatin1Char('0'));
            }
            QString decimal = QString::number(normalizedSeconds);
            if (digits > 0) {
                decimal += QLatin1Char('.') + fraction;
            }
            if (negative) {
                decimal.prepend(QLatin1Char('-'));
            }

            auto formatter = NumberFormatter::withLocale(loc)
                .precision(Precision::fixedFraction(digits))
                .integerWidth(icu::number::IntegerWidth::zeroFillTo(2))
                .grouping(UNUM_GROUPING_OFF)
                .roundingMode(UNUM_ROUND_DOWN);
            const auto result = formatter.formatDecimal(decimal.toStdString(), status);
            check(status, "NumberFormatter::formatDecimal(duration)");
            const QString output = text(result.toString(status));
            auto positions = fields(result, status);
            QVariantMap formattedResult = formatted(output, positions, UFIELD_CATEGORY_NUMBER, [negative](int field, int) { return numberField(field, negative ? -1.0 : 1.0); });
            auto parts = formattedResult.value(QStringLiteral("parts")).toList();
            for (auto &item : parts) {
                auto part = item.toMap();
                part.insert(QStringLiteral("unit"), QStringLiteral("second"));
                item = part;
            }
            QVariantMap finalResult;
            finalResult.insert(QStringLiteral("text"), output);
            finalResult.insert(QStringLiteral("parts"), parts);
            return finalResult;
        }

        QVariantMap duration(const Options &request) {
            const auto options = optionsOf(request);
            const auto values = request.value(QStringLiteral("duration")).toMap();
            const QString localeTag = stringOption(request, "locale");
            const auto loc = withKeywords(locale(localeTag), options);
            const QString style = stringOption(options, "style", "short");
            UErrorCode status = U_ZERO_ERROR;
            if (style == QLatin1String("digital")) {
                if (options.contains(QStringLiteral("fractionalDigits"))) {
                    return durationDigitalFractional(options, values, localeTag, status);
                }
                return durationDigitalText(options, values, localeTag, status);
            }

            QVariantList items;
            std::vector<QVariantList> itemParts;
            bool signDisplayed = false;
            bool negative = false;
            for (auto it = values.cbegin(); it != values.cend(); ++it) {
                if (it.value().toDouble() < 0) {
                    negative = true;
                }
            }
            for (const char *unit : {"year", "month", "week", "day", "hour", "minute", "second", "millisecond", "microsecond", "nanosecond"}) {
                const QString singular = QString::fromLatin1(unit);
                const QString plural = singular + QLatin1Char('s');
                double value = values.value(plural, 0).toDouble();
                const QString unitStyle = options.value(plural, style).toString();
                const QString display = options.value(plural + QStringLiteral("Display"), options.contains(plural) ? QStringLiteral("always") : QStringLiteral("auto")).toString();
                if (value == 0 && display != QLatin1String("always")) {
                    continue;
                }
                if (value == 0 && negative && !signDisplayed) {
                    value = -0.0;
                }
                Options nfOptions{{QStringLiteral("style"), QStringLiteral("unit")}, {QStringLiteral("unit"), singular}, {QStringLiteral("unitDisplay"), unitStyle}, {QStringLiteral("maximumFractionDigits"), 0}};
                if (options.contains(QStringLiteral("numberingSystem"))) {
                    nfOptions.insert(QStringLiteral("numberingSystem"), options.value(QStringLiteral("numberingSystem")));
                }
                if (signDisplayed) {
                    nfOptions.insert(QStringLiteral("signDisplay"), QStringLiteral("never"));
                }
                signDisplayed = true;
                const auto result = number(Options{{QStringLiteral("locale"), localeTag}, {QStringLiteral("options"), nfOptions}, {QStringLiteral("value"), value}});
                items.append(result.value(QStringLiteral("text")));
                auto parts = result.value(QStringLiteral("parts")).toList();
                for (auto &item : parts) {
                    auto part = item.toMap();
                    part.insert(QStringLiteral("unit"), singular);
                    item = part;
                }
                itemParts.push_back(parts);
            }
            const auto result = list(Options{{QStringLiteral("locale"), localeTag}, {QStringLiteral("options"), Options{{QStringLiteral("type"), QStringLiteral("unit")}, {QStringLiteral("style"), style}}}, {QStringLiteral("items"), items}});
            QVariantList flattened;
            size_t index = 0;
            for (const auto &item : result.value(QStringLiteral("parts")).toList()) {
                const auto part = item.toMap();
                if (part.value(QStringLiteral("type")) == QStringLiteral("element")) {
                    if (index >= itemParts.size()) {
                        throw std::runtime_error("ICU duration list lost element boundaries");
                    }
                    flattened.append(itemParts[index++]);
                } else {
                    flattened.append(part);
                }
            }
            QVariantMap finalResult;
            finalResult.insert(QStringLiteral("text"), result.value(QStringLiteral("text")));
            finalResult.insert(QStringLiteral("parts"), flattened);
            return finalResult;
        }

    }

    IntlBridge::IntlBridge(QObject *parent) : QObject(parent) {
    }

    QVariantMap IntlBridge::canonicalizeLocales(const QJSValue &locales) const {
        try {
            QStringList canonical;
            for (const QString &value : stringList(locales)) {
                const QString result = tag(locale(value));
                if (!canonical.contains(result)) {
                    canonical.append(result);
                }
            }
            QVariantMap result = okResult();
            result.insert(QStringLiteral("locales"), canonical);
            return result;
        } catch (const std::exception &error) {
            return errorResult(QStringLiteral("RangeError"), QString::fromUtf8(error.what()));
        }
    }

    QVariantMap IntlBridge::supportedLocalesOf(const QJSValue &locales, const QString &service) const {
        try {
            QVariantMap result = okResult();
            result.insert(QStringLiteral("locales"), lookupMatches(stringList(locales), service));
            return result;
        } catch (const std::exception &error) {
            return errorResult(QStringLiteral("RangeError"), QString::fromUtf8(error.what()));
        }
    }

    QVariantMap IntlBridge::supportedValuesOf(const QString &key) const {
        try {
            QVariantMap result = okResult();
            result.insert(QStringLiteral("values"), supportedValues(key));
            return result;
        } catch (const std::exception &error) {
            return errorResult(QStringLiteral("RangeError"), QString::fromUtf8(error.what()));
        }
    }

    QVariantMap IntlBridge::resolveLocale(const QJSValue &locales, const QString &service, const QJSValue &options) const {
        try {
            const QStringList requested = stringList(locales);
            QString selected;
            if (requested.isEmpty()) {
                selected = tag(icu::Locale::getDefault());
            } else {
                const QStringList matches = lookupMatches(requested, service);
                selected = matches.isEmpty() ? tag(icu::Locale::getDefault()) : matches.first();
            }
            icu::Locale loc = locale(selected);
            applyResolvedKeywords(loc, options.toVariant().toMap());
            UErrorCode status = U_ZERO_ERROR;
            loc.canonicalize(status);
            check(status, "Locale::canonicalize(resolve)");
            QVariantMap result = okResult();
            result.insert(QStringLiteral("locale"), tag(loc));
            result.insert(QStringLiteral("calendar"), keyword(loc, "ca"));
            result.insert(QStringLiteral("collation"), keyword(loc, "co"));
            result.insert(QStringLiteral("hourCycle"), keyword(loc, "hc"));
            result.insert(QStringLiteral("caseFirst"), keyword(loc, "kf"));
            result.insert(QStringLiteral("numeric"), keyword(loc, "kn"));
            result.insert(QStringLiteral("numberingSystem"), keyword(loc, "nu"));
            result.insert(QStringLiteral("firstDayOfWeek"), keyword(loc, "fw"));
            result.insert(QStringLiteral("defaultNumberingSystem"), numberingSystem(loc));
            std::unique_ptr<icu::Calendar> calendar(icu::Calendar::createInstance(loc, status));
            required(calendar, status, "Calendar::createInstance(resolve)");
            result.insert(QStringLiteral("defaultCalendar"), unicodeType("calendar", QString::fromLatin1(calendar->getType())));
            std::unique_ptr<icu::DateTimePatternGenerator> generator(icu::DateTimePatternGenerator::createInstance(loc, status));
            required(generator, status, "DateTimePatternGenerator::createInstance(resolve)");
            result.insert(QStringLiteral("defaultHourCycle"), hourCycle(generator->getDefaultHourCycle(status)));
            check(status, "DateTimePatternGenerator::getDefaultHourCycle(resolve)");
            return result;
        } catch (const std::exception &error) {
            return errorResult(QStringLiteral("RangeError"), QString::fromUtf8(error.what()));
        }
    }

    QVariantMap IntlBridge::numberDefaults(const QJSValue &request) const {
        try {
            QVariantMap result = okResult();
            const QVariantMap defaults = Internal::numberDefaults(request.toVariant().toMap());
            for (auto it = defaults.cbegin(); it != defaults.cend(); ++it) {
                result.insert(it.key(), it.value());
            }
            return result;
        } catch (const std::exception &error) {
            return errorResult(QStringLiteral("RangeError"), QString::fromUtf8(error.what()));
        }
    }

    QVariantMap IntlBridge::formatNumber(const QJSValue &request) const {
        try {
            QVariantMap result = okResult();
            const QVariantMap formatted = number(request.toVariant().toMap());
            for (auto it = formatted.cbegin(); it != formatted.cend(); ++it) {
                result.insert(it.key(), it.value());
            }
            return result;
        } catch (const std::exception &error) {
            return errorResult(QStringLiteral("RangeError"), QString::fromUtf8(error.what()));
        }
    }

    QVariantMap IntlBridge::plural(const QJSValue &request) const {
        try {
            QVariantMap result = okResult();
            result.insert(QStringLiteral("value"), Internal::plural(request.toVariant().toMap()));
            return result;
        } catch (const std::exception &error) {
            return errorResult(QStringLiteral("RangeError"), QString::fromUtf8(error.what()));
        }
    }

    QVariantMap IntlBridge::collate(const QJSValue &request) const {
        try {
            QVariantMap result = okResult();
            result.insert(QStringLiteral("comparison"), Internal::collate(request.toVariant().toMap()));
            return result;
        } catch (const std::exception &error) {
            return errorResult(QStringLiteral("RangeError"), QString::fromUtf8(error.what()));
        }
    }

    QVariantMap IntlBridge::formatDate(const QJSValue &request) const {
        try {
            QVariantMap result = okResult();
            const QVariantMap formatted = date(request.toVariant().toMap());
            for (auto it = formatted.cbegin(); it != formatted.cend(); ++it) {
                result.insert(it.key(), it.value());
            }
            return result;
        } catch (const std::exception &error) {
            return errorResult(QStringLiteral("RangeError"), QString::fromUtf8(error.what()));
        }
    }

    QVariantMap IntlBridge::dateDefaults(const QJSValue &request) const {
        try {
            QVariantMap result = okResult();
            const QVariantMap defaults = Internal::dateDefaults(request.toVariant().toMap());
            for (auto it = defaults.cbegin(); it != defaults.cend(); ++it) {
                result.insert(it.key(), it.value());
            }
            return result;
        } catch (const std::exception &error) {
            return errorResult(QStringLiteral("RangeError"), QString::fromUtf8(error.what()));
        }
    }

    QVariantMap IntlBridge::formatList(const QJSValue &request) const {
        try {
            QVariantMap result = okResult();
            const QVariantMap formatted = list(request.toVariant().toMap());
            for (auto it = formatted.cbegin(); it != formatted.cend(); ++it) {
                result.insert(it.key(), it.value());
            }
            return result;
        } catch (const std::exception &error) {
            return errorResult(QStringLiteral("RangeError"), QString::fromUtf8(error.what()));
        }
    }

    QVariantMap IntlBridge::formatRelative(const QJSValue &request) const {
        try {
            QVariantMap result = okResult();
            const QVariantMap formatted = relative(request.toVariant().toMap());
            for (auto it = formatted.cbegin(); it != formatted.cend(); ++it) {
                result.insert(it.key(), it.value());
            }
            return result;
        } catch (const std::exception &error) {
            return errorResult(QStringLiteral("RangeError"), QString::fromUtf8(error.what()));
        }
    }

    QVariantMap IntlBridge::displayName(const QJSValue &request) const {
        try {
            QVariantMap result = okResult();
            const QVariantMap name = Internal::displayName(request.toVariant().toMap());
            for (auto it = name.cbegin(); it != name.cend(); ++it) {
                result.insert(it.key(), it.value());
            }
            return result;
        } catch (const std::exception &error) {
            return errorResult(QStringLiteral("RangeError"), QString::fromUtf8(error.what()));
        }
    }

    QVariantMap IntlBridge::segment(const QJSValue &request) const {
        try {
            QVariantMap result = okResult();
            result.insert(QStringLiteral("segments"), segments(request.toVariant().toMap()));
            return result;
        } catch (const std::exception &error) {
            return errorResult(QStringLiteral("RangeError"), QString::fromUtf8(error.what()));
        }
    }

    QVariantMap IntlBridge::localeProperties(const QJSValue &request) const {
        try {
            QVariantMap result = okResult();
            const QVariantMap properties = Internal::localeProperties(request.toVariant().toMap());
            for (auto it = properties.cbegin(); it != properties.cend(); ++it) {
                result.insert(it.key(), it.value());
            }
            return result;
        } catch (const std::exception &error) {
            return errorResult(QStringLiteral("RangeError"), QString::fromUtf8(error.what()));
        }
    }

    QVariantMap IntlBridge::localeInfo(const QJSValue &request) const {
        try {
            QVariantMap result = okResult();
            const QVariantMap info = Internal::localeInfo(request.toVariant().toMap());
            for (auto it = info.cbegin(); it != info.cend(); ++it) {
                result.insert(it.key(), it.value());
            }
            return result;
        } catch (const std::exception &error) {
            return errorResult(QStringLiteral("RangeError"), QString::fromUtf8(error.what()));
        }
    }

    QVariantMap IntlBridge::formatDuration(const QJSValue &request) const {
        try {
            QVariantMap result = okResult();
            const QVariantMap formatted = duration(request.toVariant().toMap());
            for (auto it = formatted.cbegin(); it != formatted.cend(); ++it) {
                result.insert(it.key(), it.value());
            }
            return result;
        } catch (const std::exception &error) {
            return errorResult(QStringLiteral("RangeError"), QString::fromUtf8(error.what()));
        }
    }

    QVariantMap IntlBridge::canonicalizeTimeZone(const QJSValue &request) const {
        try {
            const QString identifier = request.toVariant().toMap().value(QStringLiteral("timeZone")).toString();
            if (identifier.isEmpty()) {
                return errorResult(QStringLiteral("RangeError"), QStringLiteral("Invalid time zone"));
            }
            static const QRegularExpression offsetPattern(QStringLiteral("^([+-])([0-9]{2})(?::?([0-9]{2}))?$"));
            const QRegularExpressionMatch match = offsetPattern.match(identifier);
            if (match.hasMatch()) {
                const QString sign = match.captured(1);
                const int hours = match.captured(2).toInt();
                const int minutes = match.captured(3).toInt();
                if (hours > 23 || minutes > 59) {
                    return errorResult(QStringLiteral("RangeError"), QStringLiteral("Invalid time zone offset"));
                }
                QVariantMap result = okResult();
                result.insert(QStringLiteral("timeZone"), QStringLiteral("%1%2:%3").arg(sign).arg(hours, 2, 10, QLatin1Char('0')).arg(minutes, 2, 10, QLatin1Char('0')));
                return result;
            }
            if (identifier.compare(QStringLiteral("UTC"), Qt::CaseInsensitive) == 0) {
                QVariantMap result = okResult();
                result.insert(QStringLiteral("timeZone"), QStringLiteral("UTC"));
                return result;
            }
            UErrorCode status = U_ZERO_ERROR;
            std::unique_ptr<icu::TimeZone> zone(icu::TimeZone::createTimeZone(unicode(identifier)));
            if (!zone) {
                return errorResult(QStringLiteral("RangeError"), QStringLiteral("Invalid time zone"));
            }
            UnicodeString rawId;
            zone->getID(rawId);
            UnicodeString canonicalId;
            UBool isSystemId = false;
            icu::TimeZone::getCanonicalID(rawId, canonicalId, isSystemId, status);
            if (U_FAILURE(status) || !isSystemId || canonicalId == UnicodeString("Etc/Unknown") || canonicalId == UnicodeString("GMT")) {
                return errorResult(QStringLiteral("RangeError"), QStringLiteral("Invalid time zone"));
            }
            QVariantMap result = okResult();
            result.insert(QStringLiteral("timeZone"), text(canonicalId));
            return result;
        } catch (const std::exception &error) {
            return errorResult(QStringLiteral("RangeError"), QString::fromUtf8(error.what()));
        }
    }

    QVariantMap IntlBridge::caseMap(const QJSValue &request) const {
        try {
            const QVariantMap map = request.toVariant().toMap();
            auto value = unicode(stringOption(map, "input"));
            const auto loc = locale(stringOption(map, "locale"));
            if (map.value(QStringLiteral("upper")).toBool()) {
                value.toUpper(loc);
            } else {
                value.toLower(loc);
            }
            QVariantMap result = okResult();
            result.insert(QStringLiteral("text"), text(value));
            return result;
        } catch (const std::exception &error) {
            return errorResult(QStringLiteral("RangeError"), QString::fromUtf8(error.what()));
        }
    }

}
