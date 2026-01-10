package com.safety.sos_backend.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.io.IOException;
import java.nio.file.*;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/media")
@CrossOrigin(origins = "*")   // allow Expo app to call this from mobile
public class MediaUploadController {

    @Value("${media.upload.dir}")
    private String uploadDir;

    @PostMapping("/upload")
    public ResponseEntity<Map<String, String>> uploadFile(@RequestParam("file") MultipartFile file)
            throws IOException {

        if (file == null || file.isEmpty()) {
            Map<String, String> error = new HashMap<>();
            error.put("error", "File is empty or missing");
            return ResponseEntity.badRequest().body(error);
        }

        // Make sure folder exists
        Path uploadPath = Paths.get(uploadDir);
        if (!Files.exists(uploadPath)) {
            Files.createDirectories(uploadPath);
        }

        // Unique filename: timestamp_originalName
        String originalName = file.getOriginalFilename();
        String fileName = System.currentTimeMillis() + "_" +
                (originalName != null ? originalName : "sos-file");

        Path filePath = uploadPath.resolve(fileName);

        // Save file
        Files.copy(file.getInputStream(), filePath, StandardCopyOption.REPLACE_EXISTING);

        // Build public URL → http://<your-ip>:8080/uploads/<filename>
        String fileDownloadUri = ServletUriComponentsBuilder.fromCurrentContextPath()
                .path("/uploads/")
                .path(fileName)
                .toUriString();

        Map<String, String> body = new HashMap<>();
        body.put("url", fileDownloadUri);

        return ResponseEntity.ok(body);
    }
}
