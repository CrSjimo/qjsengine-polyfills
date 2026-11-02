#ifndef QJSENGINEPOLYFILLINTL_INTLBRIDGE_H
#define QJSENGINEPOLYFILLINTL_INTLBRIDGE_H

#include <QJSValue>
#include <QObject>
#include <QString>
#include <QVariantMap>

namespace QJSEnginePolyfills::Internal {

    class IntlBridge : public QObject {
        Q_OBJECT

    public:
        explicit IntlBridge(QObject *parent = nullptr);

        Q_INVOKABLE QVariantMap canonicalizeLocales(const QJSValue &locales) const;
        Q_INVOKABLE QVariantMap supportedLocalesOf(const QJSValue &locales, const QString &service) const;
        Q_INVOKABLE QVariantMap supportedValuesOf(const QString &key) const;
        Q_INVOKABLE QVariantMap resolveLocale(const QJSValue &locales, const QString &service, const QJSValue &options) const;
        Q_INVOKABLE QVariantMap numberDefaults(const QJSValue &request) const;
        Q_INVOKABLE QVariantMap formatNumber(const QJSValue &request) const;
        Q_INVOKABLE QVariantMap plural(const QJSValue &request) const;
        Q_INVOKABLE QVariantMap collate(const QJSValue &request) const;
        Q_INVOKABLE QVariantMap formatDate(const QJSValue &request) const;
        Q_INVOKABLE QVariantMap dateDefaults(const QJSValue &request) const;
        Q_INVOKABLE QVariantMap formatList(const QJSValue &request) const;
        Q_INVOKABLE QVariantMap formatRelative(const QJSValue &request) const;
        Q_INVOKABLE QVariantMap displayName(const QJSValue &request) const;
        Q_INVOKABLE QVariantMap segment(const QJSValue &request) const;
        Q_INVOKABLE QVariantMap localeProperties(const QJSValue &request) const;
        Q_INVOKABLE QVariantMap localeInfo(const QJSValue &request) const;
        Q_INVOKABLE QVariantMap formatDuration(const QJSValue &request) const;
        Q_INVOKABLE QVariantMap canonicalizeTimeZone(const QJSValue &request) const;
        Q_INVOKABLE QVariantMap caseMap(const QJSValue &request) const;
    };

}

#endif // QJSENGINEPOLYFILLINTL_INTLBRIDGE_H
