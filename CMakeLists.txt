cmake_minimum_required(VERSION 3.17)

project(QJSEnginePolyfills VERSION 0.0.1.0 LANGUAGES CXX)

# ----------------------------------
# Build Options
# ----------------------------------
option(QJSENGINE_POLYFILLS_BUILD_STATIC "Build static libraries" OFF)
option(QJSENGINE_POLYFILLS_BUILD_TESTS "Build test cases" OFF)
option(QJSENGINE_POLYFILLS_INSTALL "Install library" ON)

# ----------------------------------
# CMake Settings
# ----------------------------------
if(MSVC)
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} /manifest:no")
    set(CMAKE_MODULE_LINKER_FLAGS "${CMAKE_MODULE_LINKER_FLAGS} /manifest:no")
    set(CMAKE_SHARED_LINKER_FLAGS "${CMAKE_SHARED_LINKER_FLAGS} /manifest:no")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} /utf-8")

    if(NOT DEFINED CMAKE_DEBUG_POSTFIX)
        set(CMAKE_DEBUG_POSTFIX "d")
    endif()
endif()

if(QJSENGINE_POLYFILLS_INSTALL)
    include(GNUInstallDirs)
    include(CMakePackageConfigHelpers)
endif()

# ----------------------------------
# Project Variables
# ----------------------------------
set(QJSENGINE_POLYFILLS_VERSION ${PROJECT_VERSION})
set(QJSENGINE_POLYFILLS_INSTALL_NAME ${PROJECT_NAME})

# ----------------------------------
# Find basic dependencies
# ----------------------------------
find_package(qmsetup REQUIRED)

qm_import(Filesystem)

if(NOT DEFINED QMSETUP_BUILD_DIR)
    set(QMSETUP_BUILD_DIR "${CMAKE_BINARY_DIR}/out")
endif()

qm_init_directories()

# ----------------------------------
# Add source modules
# ----------------------------------
add_subdirectory(src)

if(QJSENGINE_POLYFILLS_BUILD_TESTS)
    enable_testing()
endif()

if(QJSENGINE_POLYFILLS_BUILD_TESTS)
    add_subdirectory(tests)
endif()
