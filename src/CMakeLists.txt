qm_import(Preprocess)

set(QJSENGINE_POLYFILLS_PROJECT_DESCRIPTION "QJSEngine Polyfills")
set(QJSENGINE_POLYFILLS_PROJECT_COPYRIGHT "Copyright 2026")
set(QJSENGINE_POLYFILLS_GENERATED_INCLUDE_DIR ${CMAKE_CURRENT_BINARY_DIR}/../include)
set(QJSENGINE_POLYFILLS_BUILD_INCLUDE_DIR ${CMAKE_CURRENT_BINARY_DIR}/../etc/include)

# ----------------------------------
# Configurations
# ----------------------------------
set(QMSETUP_DEFINITION_SCOPE DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR})
set(QMSETUP_DEFINITION_NUMERICAL on)

qm_generate_config(${QJSENGINE_POLYFILLS_BUILD_INCLUDE_DIR}/QJSEnginePolyfillIntl/qjsenginepolyfillsconfig.h)

if(QJSENGINE_POLYFILLS_INSTALL)
    install(FILES ${QJSENGINE_POLYFILLS_BUILD_INCLUDE_DIR}/QJSEnginePolyfillIntl/qjsenginepolyfillsconfig.h
        DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}/${QJSENGINE_POLYFILLS_INSTALL_NAME}/QJSEnginePolyfillIntl
    )
endif()

# ----------------------------------
# CMake API
# ----------------------------------
macro(qjsenginepolyfills_add_library _target)
    set(options AUTOGEN NO_SYNC_INCLUDE NO_WIN_RC STATIC)
    set(oneValueArgs SYNC_INCLUDE_PREFIX PREFIX EXPORT_NAME)
    set(multiValueArgs SYNC_INCLUDE_OPTIONS)
    cmake_parse_arguments(FUNC "${options}" "${oneValueArgs}" "${multiValueArgs}" ${ARGN})

    if(FUNC_AUTOGEN)
        set(CMAKE_AUTOMOC ON)
        set(CMAKE_AUTOUIC ON)
        set(CMAKE_AUTORCC ON)
    endif()

    if(FUNC_STATIC OR QJSENGINE_POLYFILLS_BUILD_STATIC)
        set(_type STATIC)
    else()
        set(_type SHARED)
    endif()

    add_library(${_target} ${_type})

    if(WIN32 AND NOT FUNC_NO_WIN_RC AND(${_type} STREQUAL "SHARED"))
        qm_add_win_rc(${_target}
            NAME ${QJSENGINE_POLYFILLS_INSTALL_NAME}
            DESCRIPTION ${QJSENGINE_POLYFILLS_PROJECT_DESCRIPTION}
            COPYRIGHT ${QJSENGINE_POLYFILLS_PROJECT_COPYRIGHT}
        )
    endif()

    if(FUNC_PREFIX)
        set(_prefix_option PREFIX ${FUNC_PREFIX})
    else()
        set(_prefix_option)
    endif()

    qm_export_defines(${_target} ${_prefix_option})
    qm_configure_target(${_target} ${FUNC_UNPARSED_ARGUMENTS})

    target_include_directories(${_target} PRIVATE ${QJSENGINE_POLYFILLS_BUILD_INCLUDE_DIR})
    target_include_directories(${_target} PRIVATE .)

    if(FUNC_EXPORT_NAME)
        set(_name ${FUNC_EXPORT_NAME})
    elseif(${_target} MATCHES "^QJSEnginePolyfills(.+)")
        set(_name ${CMAKE_MATCH_1})
    else()
        set(_name ${_target})
    endif()

    add_library(${QJSENGINE_POLYFILLS_INSTALL_NAME}::${_name} ALIAS ${_target})

    if(FUNC_SYNC_INCLUDE_PREFIX)
        set(_inc_name ${FUNC_SYNC_INCLUDE_PREFIX})
    else()
        set(_inc_name ${_target})
    endif()

    set(_install_options)

    if(QJSENGINE_POLYFILLS_INSTALL)
        install(TARGETS ${_target}
            EXPORT ${QJSENGINE_POLYFILLS_INSTALL_NAME}Targets
            RUNTIME DESTINATION "${CMAKE_INSTALL_BINDIR}" OPTIONAL
            LIBRARY DESTINATION "${CMAKE_INSTALL_LIBDIR}" OPTIONAL
            ARCHIVE DESTINATION "${CMAKE_INSTALL_LIBDIR}" OPTIONAL
        )

        target_include_directories(${_target} PUBLIC
            "$<INSTALL_INTERFACE:${CMAKE_INSTALL_INCLUDEDIR}/${QJSENGINE_POLYFILLS_INSTALL_NAME}>"
        )

        set(_install_options
            INSTALL_DIR "${CMAKE_INSTALL_INCLUDEDIR}/${QJSENGINE_POLYFILLS_INSTALL_NAME}/${_inc_name}"
        )
    endif()

    if(NOT FUNC_NO_SYNC_INCLUDE)
        qm_sync_include(. "${QJSENGINE_POLYFILLS_GENERATED_INCLUDE_DIR}/${_inc_name}" ${_install_options}
            ${FUNC_SYNC_INCLUDE_OPTIONS} FORCE
        )
        target_include_directories(${_target} PUBLIC
            "$<BUILD_INTERFACE:${QJSENGINE_POLYFILLS_GENERATED_INCLUDE_DIR}>"
        )
    endif()
endmacro()

# ----------------------------------
# Main Project
# ----------------------------------
add_subdirectory(intl)

# ----------------------------------
# Install
# ----------------------------------
if(QJSENGINE_POLYFILLS_INSTALL)
    set(_install_dir ${CMAKE_INSTALL_LIBDIR}/cmake/${QJSENGINE_POLYFILLS_INSTALL_NAME})

    write_basic_package_version_file(
        "${CMAKE_CURRENT_BINARY_DIR}/${QJSENGINE_POLYFILLS_INSTALL_NAME}ConfigVersion.cmake"
        VERSION ${PROJECT_VERSION}
        COMPATIBILITY AnyNewerVersion
    )

    configure_package_config_file(
        ${CMAKE_CURRENT_LIST_DIR}/${QJSENGINE_POLYFILLS_INSTALL_NAME}Config.cmake.in
        "${CMAKE_CURRENT_BINARY_DIR}/${QJSENGINE_POLYFILLS_INSTALL_NAME}Config.cmake"
        INSTALL_DESTINATION ${_install_dir}
        NO_CHECK_REQUIRED_COMPONENTS_MACRO
    )

    install(FILES
        "${CMAKE_CURRENT_BINARY_DIR}/${QJSENGINE_POLYFILLS_INSTALL_NAME}Config.cmake"
        "${CMAKE_CURRENT_BINARY_DIR}/${QJSENGINE_POLYFILLS_INSTALL_NAME}ConfigVersion.cmake"
        DESTINATION ${_install_dir}
    )

    install(EXPORT ${QJSENGINE_POLYFILLS_INSTALL_NAME}Targets
        FILE "${QJSENGINE_POLYFILLS_INSTALL_NAME}Targets.cmake"
        NAMESPACE ${QJSENGINE_POLYFILLS_INSTALL_NAME}::
        DESTINATION ${_install_dir}
    )
endif()
