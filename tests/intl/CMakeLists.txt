project(tst_QJSEnginePolyfills_Intl LANGUAGES CXX)

find_package(ICU 73 REQUIRED COMPONENTS uc i18n data)

qjsenginepolyfills_add_qt_test(${PROJECT_NAME}
    tst_QJSEnginePolyfills_Intl.cpp
    IntlTestOracle.h
    IntlTestOracle.cpp
)

qt_add_resources(${PROJECT_NAME} intl_test_resources
    PREFIX "/intl-tests"
    BASE "${CMAKE_CURRENT_SOURCE_DIR}/cases"
    FILES
        cases/harness.js
        cases/infrastructure.js
        cases/structure.js
        cases/locales.js
        cases/collator.js
        cases/numberformat.js
        cases/datetimeformat.js
        cases/pluralrules.js
        cases/relativetimeformat.js
        cases/listformat.js
        cases/displaynames.js
        cases/segmenter.js
        cases/durationformat.js
        cases/locale.js
        cases/parameters.js
        cases/builtins.js
)

target_link_libraries(${PROJECT_NAME} PRIVATE
    ICU::uc
    ICU::i18n
    ICU::data
)
