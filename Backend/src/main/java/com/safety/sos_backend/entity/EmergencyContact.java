package com.safety.sos_backend.entity;

import jakarta.persistence.*;
import lombok.Data;

@Entity
@Data
public class EmergencyContact {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;
    private String phoneNumber;
    private boolean primaryContact;
}
