import java.util.Properties

plugins {
    id("com.android.application")
}

// 서명 키 경로는 Git에 올리지 않는 local.properties에서 읽는다.
// 같은 키로 서명해야 기존 앱 위에 업데이트가 설치된다. 키 파일을 잃어버리지 않게 백업할 것.
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
val keystorePath: String? = localProps.getProperty("hometv.keystore")

android {
    namespace = "com.hometv.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.hometv.app"
        minSdk = 24
        targetSdk = 35
        versionCode = 6
        versionName = "1.5"
        buildConfigField("String", "UPDATE_REPO", "\"tenjung/hometv\"")
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        create("hometv") {
            if (keystorePath != null) {
                storeFile = file(keystorePath)
                storePassword = localProps.getProperty("hometv.storePassword", "android")
                keyAlias = localProps.getProperty("hometv.keyAlias", "androiddebugkey")
                keyPassword = localProps.getProperty("hometv.keyPassword", "android")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (keystorePath != null) signingConfigs.getByName("hometv") else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
