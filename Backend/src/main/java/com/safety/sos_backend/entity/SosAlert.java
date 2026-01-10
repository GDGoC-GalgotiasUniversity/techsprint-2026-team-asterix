package com.safety.sos_backend.entity;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Entity
@Data
public class SosAlert {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private double latitude;
    private double longitude;

    private String contactNumber;

    private LocalDateTime timestamp = LocalDateTime.now();

    // ✅ New field for storing Firebase audio/video link
    private String mediaUrl;
}
