; GameCode installer script for Inno Setup 6 (https://jrsoftware.org/isinfo.php)
; Compile on the build PC:  ISCC.exe gamecode-setup.iss
; Output: Output\GameCodeSetup.exe  (a real .exe installer, not a .cmd/.bat/.sh)
; Inno Setup also auto-generates the uninstaller (unins000.exe) in the install folder.
;
; Before compiling, stage these files in .\dist\  (see BUILD-INSTALLER.md):
;   dist\gamecode.exe    compiled GameCode binary (bun build of the fork)
;   dist\prompts.enc     encrypted agent prompts (AES-256-GCM)
;   dist\opencode.jsonc  GameCode config (no plain-text prompts inside)
;   dist\prompt.key      prompt decryption key (goes to app data, NOT the app folder)

#define MyAppName "GameCode"
#define MyAppVersion "1.0"
#define MyAppPublisher "Qamar ul Hasnain"
#define MyAppExeName "gamecode.exe"

[Setup]
AppId={{8F3A2C41-6B7D-4E9A-B5C2-1D0E7A4F9C10}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\GameCode
DefaultGroupName=GameCode
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=Output
OutputBaseFilename=GameCodeSetup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ChangesEnvironment=yes
UninstallDisplayName=GameCode
UninstallDisplayIcon={app}\{#MyAppExeName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked
Name: "addtopath"; Description: "Add GameCode to my PATH (run gamecode in any terminal)"; GroupDescription: "Additional options:"

[Files]
; The compiled binary is standalone (Bun compile bundles the runtime),
; so there are no separate runtime dependencies to install.
Source: "dist\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\prompts.enc"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\opencode.jsonc"; DestDir: "{app}"; Flags: ignoreversion
; Also place the config in the per-user global config folder, so GameCode
; finds its agents no matter which folder it is launched from.
Source: "dist\opencode.jsonc"; DestDir: "{%USERPROFILE}\.config\opencode"; Flags: ignoreversion
; The prompt key goes to per-user app data, outside the program folder and
; outside any source repo.
Source: "dist\prompt.key"; DestDir: "{localappdata}\GameCode"; Flags: ignoreversion

[Icons]
Name: "{group}\GameCode"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{userdocs}"
Name: "{group}\Uninstall GameCode"; Filename: "{uninstallexe}"
Name: "{autodesktop}\GameCode"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{userdocs}"; Tasks: desktopicon

[Registry]
; PATH entry is handled in [Code] so it is removed cleanly on uninstall.

[Run]
; Ask GameCode to write its signed install stamp now, so the 2-day license
; counts from installation time, not from first launch.
Filename: "{app}\{#MyAppExeName}"; Parameters: "--gamecode-write-stamp"; StatusMsg: "Activating the 2-day license..."; Flags: runhidden waituntilterminated
Filename: "{app}\{#MyAppExeName}"; Description: "Launch GameCode"; Flags: nowait postinstall skipifsilent; WorkingDir: "{userdocs}"

[UninstallDelete]
; Clean uninstall: remove GameCode's per-user data (prompt key, license
; stamp, saved credentials) along with the program files.
Type: filesandordirs; Name: "{localappdata}\GameCode"
; Also remove the global config copy placed at install time.
Type: files; Name: "{%USERPROFILE}\.config\opencode\opencode.jsonc"

[Code]
var
  KeyPage: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  { Ask for the dedicated OpenCode Zen workspace key at install time.
    Leaving it blank is allowed: GameCode then shows only the built-in
    Build and Plan agents until a valid key is added. }
  KeyPage := CreateInputQueryPage(wpSelectDir,
    'OpenCode Zen API Key', 'GameCode custom agents need a Zen workspace key',
    'Paste the API key of your dedicated OpenCode Console / Zen workspace. ' +
    'The 5 custom GameCode agents (Agent1 to Agent5) unlock only with a valid key. ' +
    'You can leave this blank and add a key later; without it only Build and Plan are available.');
  KeyPage.Add('Zen workspace API key:', False);
end;

procedure SaveZenKey;
var
  KeyValue: String;
  Dir: String;
begin
  KeyValue := Trim(KeyPage.Values[0]);
  if KeyValue = '' then
    Exit;
  Dir := ExpandConstant('{localappdata}\GameCode\credentials');
  ForceDirectories(Dir);
  SaveStringToFile(Dir + '\zen.key', KeyValue, False);
end;

{ --- PATH handling (add on install when the task is chosen, remove on uninstall) --- }
const
  EnvKey = 'Environment';

procedure AddToPath;
var
  Paths: String;
  AppDir: String;
begin
  AppDir := ExpandConstant('{app}');
  if not RegQueryStringValue(HKEY_CURRENT_USER, EnvKey, 'Path', Paths) then
    Paths := '';
  if Pos(';' + Uppercase(AppDir) + ';', ';' + Uppercase(Paths) + ';') = 0 then
  begin
    if (Paths <> '') and (Paths[Length(Paths)] <> ';') then
      Paths := Paths + ';';
    RegWriteStringValue(HKEY_CURRENT_USER, EnvKey, 'Path', Paths + AppDir);
  end;
end;

procedure RemoveFromPath;
var
  Paths: String;
  AppDir: String;
  P: Integer;
begin
  AppDir := ExpandConstant('{app}');
  if not RegQueryStringValue(HKEY_CURRENT_USER, EnvKey, 'Path', Paths) then
    Exit;
  P := Pos(Uppercase(AppDir), Uppercase(Paths));
  if P = 0 then
    Exit;
  Delete(Paths, P, Length(AppDir));
  StringChangeEx(Paths, ';;', ';', True);
  if (Length(Paths) > 0) and (Paths[1] = ';') then
    Delete(Paths, 1, 1);
  if (Length(Paths) > 0) and (Paths[Length(Paths)] = ';') then
    Delete(Paths, Length(Paths), 1);
  RegWriteStringValue(HKEY_CURRENT_USER, EnvKey, 'Path', Paths);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    SaveZenKey;
    if WizardIsTaskSelected('addtopath') then
      AddToPath;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
    RemoveFromPath;
end;
