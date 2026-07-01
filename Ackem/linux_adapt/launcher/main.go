// AckemLauncher — 轻量启动器 / 更新器（替代整份 Ackem.exe 复制）
// 默认：启动 Ackem.exe
// 更新：AckemLauncher.exe --ackem-updater=C:\path\to\job.json
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

type updateJob struct {
	InstallDir     string `json:"installDir"`
	CurrentVersion string `json:"currentVersion"`
	TargetVersion  string `json:"targetVersion"`
	Channel        string `json:"channel"`
	DownloadURL    string `json:"downloadUrl"`
	ExpectedSize   int64  `json:"expectedSize"`
	ReleasePageURL string `json:"releasePageUrl"`
	ZipPath        string `json:"zipPath"`
	StagingDir     string `json:"stagingDir"`
	ExtractDir     string `json:"extractDir"`
	AckemExe       string `json:"ackemExe"`
}

const (
	minAsarBytes = 80_000_000
	maxAsarBytes = 500_000_000
)

func installDir() string {
	exe, err := os.Executable()
	if err != nil {
		return "."
	}
	return filepath.Dir(exe)
}

func ackemExePath() string {
	return filepath.Join(installDir(), "Ackem.exe")
}

func sevenZipPath() string {
	return filepath.Join(installDir(), "resources", "tools", "7za.exe")
}

func println(msg string) {
	fmt.Println(msg)
}

func fail(msg string) {
	println("ERROR: " + msg)
	waitBeforeExit(8)
	os.Exit(1)
}

func waitBeforeExit(seconds int) {
	println(fmt.Sprintf("Press Enter to close (%ds)…", seconds))
	done := make(chan struct{})
	go func() {
		time.Sleep(time.Duration(seconds) * time.Second)
		close(done)
	}()
	go func() {
		buf := make([]byte, 1)
		_, _ = os.Stdin.Read(buf)
		close(done)
	}()
	<-done
}

func launchAckem() {
	exe := ackemExePath()
	if _, err := os.Stat(exe); err != nil {
		fail("Ackem.exe not found: " + exe)
	}
	cmd := exec.Command(exe)
	cmd.Dir = installDir()
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: false}
	if err := cmd.Start(); err != nil {
		fail("Failed to start Ackem: " + err.Error())
	}
}

func readJob(path string) updateJob {
	path = strings.Trim(path, `"`)
	data, err := os.ReadFile(path)
	if err != nil {
		fail("Cannot read job file: " + err.Error())
	}
	var job updateJob
	if err := json.Unmarshal(data, &job); err != nil {
		fail("Invalid job.json: " + err.Error())
	}
	return job
}

func downloadFile(url, dest string, expected int64) {
	part := dest + ".part"
	start := int64(0)
	if st, err := os.Stat(part); err == nil {
		start = st.Size()
	} else if err := os.Remove(dest); err == nil {
		start = 0
	}

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		fail(err.Error())
	}
	req.Header.Set("User-Agent", "Ackem-Desktop-Updater/1.0")
	if start > 0 {
		req.Header.Set("Range", fmt.Sprintf("bytes=%d-", start))
	}

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		fail("Download failed: " + err.Error())
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK && res.StatusCode != http.StatusPartialContent {
		fail(fmt.Sprintf("Download HTTP %d", res.StatusCode))
	}

	total := expected
	if cr := res.Header.Get("Content-Range"); cr != "" {
		if i := strings.LastIndex(cr, "/"); i >= 0 {
			if n, err := strconv.ParseInt(cr[i+1:], 10, 64); err == nil {
				total = n
			}
		}
	} else if cl := res.Header.Get("Content-Length"); cl != "" {
		if n, err := strconv.ParseInt(cl, 10, 64); err == nil {
			total = start + n
		}
	}

	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		fail(err.Error())
	}
	flags := os.O_CREATE | os.O_WRONLY
	if start > 0 {
		flags |= os.O_APPEND
	} else {
		flags |= os.O_TRUNC
	}
	f, err := os.OpenFile(part, flags, 0o644)
	if err != nil {
		fail(err.Error())
	}
	defer f.Close()

	buf := make([]byte, 32*1024)
	downloaded := start
	lastTick := time.Now()
	lastBytes := downloaded
	for {
		n, readErr := res.Body.Read(buf)
		if n > 0 {
			if _, wErr := f.Write(buf[:n]); wErr != nil {
				fail(wErr.Error())
			}
			downloaded += int64(n)
			if time.Since(lastTick) >= 500*time.Millisecond {
				pct := float64(0)
				if total > 0 {
					pct = float64(downloaded) / float64(total) * 100
				}
				speed := float64(downloaded-lastBytes) / time.Since(lastTick).Seconds()
				println(fmt.Sprintf("Downloading… %.0f%% (%.1f MB / %.1f MB, %.1f MB/s)",
					pct, float64(downloaded)/1e6, float64(total)/1e6, speed/1e6))
				lastTick = time.Now()
				lastBytes = downloaded
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			fail(readErr.Error())
		}
	}
	if err := os.Rename(part, dest); err != nil {
		fail("Finalize download: " + err.Error())
	}
	println("Download complete.")
}

func runSevenZip(args ...string) {
	exe := sevenZipPath()
	if _, err := os.Stat(exe); err != nil {
		fail("Missing 7za.exe at " + exe)
	}
	cmd := exec.Command(exe, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		fail("7za failed: " + err.Error())
	}
}

func assertHealthyAsar(path string) int64 {
	st, err := os.Stat(path)
	if err != nil {
		fail("Missing app.asar: " + path)
	}
	size := st.Size()
	if size > maxAsarBytes || size < minAsarBytes {
		fail(fmt.Sprintf("app.asar size out of range: %d bytes", size))
	}
	return size
}

func robocopySync(src, dst string) {
	args := []string{src, dst, "/E", "/XD", "data", "/R:2", "/W:2", "/NFL", "/NDL", "/NJH", "/NJS", "/nc", "/ns", "/np"}
	cmd := exec.Command("robocopy", args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	err := cmd.Run()
	code := 0
	if err != nil {
		if exit, ok := err.(*exec.ExitError); ok {
			code = exit.ExitCode()
		} else {
			fail("robocopy: " + err.Error())
		}
	}
	if code >= 8 {
		fail(fmt.Sprintf("robocopy failed (%d)", code))
	}
}

func resolveStagingDir(extractDir, version string) string {
	named := filepath.Join(extractDir, fmt.Sprintf("Ackem-%s-win-x64", strings.TrimPrefix(version, "v")))
	candidates := []string{named, extractDir}
	entries, _ := os.ReadDir(extractDir)
	for _, e := range entries {
		if e.IsDir() {
			candidates = append(candidates, filepath.Join(extractDir, e.Name()))
		}
	}
	for _, c := range candidates {
		if _, err := os.Stat(filepath.Join(c, "Ackem.exe")); err == nil {
			return c
		}
	}
	fail("Extracted package missing Ackem.exe under " + extractDir)
	return ""
}

func runUpdate(jobPath string) {
	allocConsole()
	job := readJob(jobPath)
	println("Ackem Update")
	println(fmt.Sprintf("%s → %s (%s)", job.CurrentVersion, job.TargetVersion, job.Channel))
	println("")

	println("Step 1/4 — Download")
	downloadFile(job.DownloadURL, job.ZipPath, job.ExpectedSize)

	println("Step 2/4 — Verify")
	st, err := os.Stat(job.ZipPath)
	if err != nil {
		fail(err.Error())
	}
	if job.ExpectedSize > 0 && st.Size() != job.ExpectedSize {
		fail(fmt.Sprintf("Size mismatch: expected %d, got %d", job.ExpectedSize, st.Size()))
	}
	runSevenZip("t", job.ZipPath)
	println("Zip OK.")

	println("Step 3/4 — Extract")
	_ = os.RemoveAll(job.ExtractDir)
	if err := os.MkdirAll(job.ExtractDir, 0o755); err != nil {
		fail(err.Error())
	}
	runSevenZip("x", job.ZipPath, fmt.Sprintf("-o%s", job.ExtractDir), "-y")
	staging := resolveStagingDir(job.ExtractDir, job.TargetVersion)
	srcAsar := filepath.Join(staging, "resources", "app.asar")
	assertHealthyAsar(srcAsar)

	println("Step 4/4 — Install (data/ preserved)")
	robocopySync(staging, job.InstallDir)
	dstAsar := filepath.Join(job.InstallDir, "resources", "app.asar")
	assertHealthyAsar(dstAsar)
	if _, err := os.Stat(filepath.Join(job.InstallDir, "Ackem.exe")); err != nil {
		fail("Ackem.exe missing after install")
	}

	println("")
	println("Update finished. Starting Ackem…")
	launchAckem()
	waitBeforeExit(5)
}

func allocConsole() {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	proc := kernel32.NewProc("AllocConsole")
	proc.Call()
}

func main() {
	for _, arg := range os.Args[1:] {
		if strings.HasPrefix(arg, "--ackem-updater=") {
			runUpdate(strings.TrimPrefix(arg, "--ackem-updater="))
			return
		}
	}
	launchAckem()
}
