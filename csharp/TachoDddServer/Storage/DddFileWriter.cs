namespace TachoDddServer.Storage;

public static class DddFileWriter
{
    public static void Save(string path, byte[] data)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllBytes(path, data);
    }

    public static void Append(string path, byte[] data)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        using var fs = new FileStream(path, FileMode.Append, FileAccess.Write);
        fs.Write(data);
    }
}
