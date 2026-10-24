@echo off
chcp 65001 >nul
title 棟梁（Architect）アドオン - 実機テスト用コピースクリプト

echo ============================================================
echo 🏗️  棟梁（Architect）アドオン - 実機テスト用コピースクリプト
echo ============================================================
echo.

set "SOURCE_BEHAVIOR=C:\Users\shini\OneDrive\開発ソース\Minecraft\Nonax_Architect_Pack\behavior_pack\Nonax_Architect_Pack"
set "TARGET_BEHAVIOR=C:\Users\shini\AppData\Roaming\Minecraft Bedrock\Users\Shared\games\com.mojang\development_behavior_packs\Nonax_Architect_Pack"

set "SOURCE_RESOURCE=C:\Users\shini\OneDrive\開発ソース\Minecraft\Nonax_Architect_Pack\resource_pack\Nonax_Architect_Pack"
set "TARGET_RESOURCE=C:\Users\shini\AppData\Roaming\Minecraft Bedrock\Users\Shared\games\com.mojang\development_resource_packs\Nonax_Architect_Pack"

echo 📦 Behavior Pack のコピーを開始します...
if exist "%SOURCE_BEHAVIOR%" (
    if not exist "%TARGET_BEHAVIOR%" mkdir "%TARGET_BEHAVIOR%"
    xcopy /E /I /Y "%SOURCE_BEHAVIOR%\*" "%TARGET_BEHAVIOR%\" >nul 2>&1
    echo ✅ Behavior Pack を正常にコピーしました！
) else (
    echo ❌ エラー：Behavior Pack のソースフォルダが見つかりません
    echo   %SOURCE_BEHAVIOR%
)

echo.
echo 📦 Resource Pack のコピーを開始します...
if exist "%SOURCE_RESOURCE%" (
    if not exist "%TARGET_RESOURCE%" mkdir "%TARGET_RESOURCE%"
    xcopy /E /I /Y "%SOURCE_RESOURCE%\*" "%TARGET_RESOURCE%\" >nul 2>&1
    echo ✅ Resource Pack を正常にコピーしました！
) else (
    echo ❌ エラー：Resource Pack のソースフォルダが見つかりません
    echo   %SOURCE_RESOURCE%
)

echo.
echo ============================================================
echo ✅ コピーが完了しました！
echo ============================================================
echo.
echo 📝 次のステップ:
echo    1. Minecraft Bedrock Edition を再起動しますか？
echo    2. ワールドを開いて、村人を確認してください。
echo    3. 棟梁職業の村人が追加されていることを確認してください。
echo.
echo 📍 Behavior Pack の配置先:
echo   %TARGET_BEHAVIOR%
echo.
echo 📍 Resource Pack の配置先:
echo   %TARGET_RESOURCE%
echo.
pause
