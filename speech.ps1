# Read-only default audio endpoint inventory; recognition uses WinRT in the app.
param([switch]$Inventory)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    # Enumerate defaults without activating any endpoint or changing Windows settings.
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class CortanaEnumerator { }
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ICortanaEnumerator {
    [PreserveSig] int EnumAudioEndpoints(int flow, int mask, out IntPtr devices);
    [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out ICortanaDevice device);
    [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out ICortanaDevice device);
}
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ICortanaDevice {
    [PreserveSig] int Activate(ref Guid iid, int context, IntPtr parameters, out IntPtr instance);
    [PreserveSig] int OpenPropertyStore(int access, out IntPtr properties);
    [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    [PreserveSig] int GetState(out int state);
}
[ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ICortanaVolume {
    [PreserveSig] int Register(); [PreserveSig] int Unregister(); [PreserveSig] int Channels();
    [PreserveSig] int SetMasterDB(); [PreserveSig] int SetMasterScalar(); [PreserveSig] int GetMasterDB();
    [PreserveSig] int GetMasterScalar(out float level);
    [PreserveSig] int SetChannelDB(); [PreserveSig] int SetChannelScalar(); [PreserveSig] int GetChannelDB(); [PreserveSig] int GetChannelScalar();
    [PreserveSig] int SetMute(); [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool muted);
}
public static class CortanaAudioDefaults {
    public static double[] Levels(string id) {
        var enumerator = (ICortanaEnumerator)new CortanaEnumerator();
        ICortanaDevice device = null; object volume = null; IntPtr pointer = IntPtr.Zero;
        try {
            Marshal.ThrowExceptionForHR(enumerator.GetDevice(id, out device));
            var iid = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
            Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out pointer));
            volume = Marshal.GetObjectForIUnknown(pointer);
            float level; bool muted;
            Marshal.ThrowExceptionForHR(((ICortanaVolume)volume).GetMasterScalar(out level));
            Marshal.ThrowExceptionForHR(((ICortanaVolume)volume).GetMute(out muted));
            return new double[] { level, muted ? 1 : 0 };
        } finally {
            if (volume != null) Marshal.ReleaseComObject(volume);
            if (pointer != IntPtr.Zero) Marshal.Release(pointer);
            if (device != null) Marshal.ReleaseComObject(device);
            Marshal.ReleaseComObject(enumerator);
        }
    }
    public static string Get(int flow, int role) {
        var enumerator = (ICortanaEnumerator)new CortanaEnumerator();
        ICortanaDevice device = null;
        try {
            int hr = enumerator.GetDefaultAudioEndpoint(flow, role, out device);
            if (hr < 0) return "unavailable:0x" + hr.ToString("X8");
            string id; Marshal.ThrowExceptionForHR(device.GetId(out id)); return id;
        } finally {
            if (device != null) Marshal.ReleaseComObject(device);
            Marshal.ReleaseComObject(enumerator);
        }
    }
}
'@
    $defaults = @()
    foreach ($flow in 0, 1) {
        foreach ($role in 0, 1, 2) {
            $id = [CortanaAudioDefaults]::Get($flow, $role)
            $kind = if ($flow -eq 0) { 'Render' } else { 'Capture' }
            $name = $null
            if ($id.LastIndexOf('{') -ge 0) {
                $key = "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\$kind\$($id.Substring($id.LastIndexOf('{')))"
                $properties = Get-ItemProperty -LiteralPath "$key\Properties" -ErrorAction SilentlyContinue
                $name = "$($properties.'{a45c254e-df1c-4efd-8020-67d146a850e0},2') ($($properties.'{b3f8fa53-0004-438e-9003-51a46e139bfc},6'))"
            }
            $level = $null; $muted = $null
            if ($flow -eq 1 -and !$id.StartsWith('unavailable')) {
                try { $levels = [CortanaAudioDefaults]::Levels($id); $level = [Math]::Round($levels[0] * 100); $muted = $levels[1] -eq 1 } catch {}
            }
            $defaults += [pscustomobject]@{ flow = $kind; role = @('Console','Multimedia','Communications')[$role]; id = $id; name = $name; inputVolumePercent = $level; inputMuted = $muted }
        }
    }
    $defaults | ConvertTo-Json -Compress
    return
