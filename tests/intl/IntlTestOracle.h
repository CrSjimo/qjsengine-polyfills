#ifndef INTLTESTORACLE_H
#define INTLTESTORACLE_H

#include <QJSValue>
#include <QObject>

class QJSEngine;

// Test-only reference implementation using public ICU APIs, never the polyfill bridge.
class IntlTestOracle : public QObject {
    Q_OBJECT

public:
    explicit IntlTestOracle(QJSEngine *engine);
    Q_INVOKABLE QJSValue query(const QString &operation, const QJSValue &request);

private:
    QJSEngine *m_engine;
};

#endif
