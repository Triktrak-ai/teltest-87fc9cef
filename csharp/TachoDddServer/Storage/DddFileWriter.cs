namespace TachoDddServer.Storage;

public static class DddFileWriter
{
    public static void Save(string path, byte[] data)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllBytes(path, data);
    }
}
