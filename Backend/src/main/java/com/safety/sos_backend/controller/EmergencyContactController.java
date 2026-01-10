package com.safety.sos_backend.controller;

import com.safety.sos_backend.entity.EmergencyContact;
import com.safety.sos_backend.repo.EmergencyContactRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/contacts")
@CrossOrigin(origins = "*")   // allow Expo / APK access
public class EmergencyContactController {

    @Autowired
    private EmergencyContactRepository repository;

    // GET → List all contacts
    @GetMapping
    public List<EmergencyContact> getAllContacts() {
        return repository.findAll();
    }

    // POST → Add new contact
    @PostMapping
    public ResponseEntity<EmergencyContact> addContact(@RequestBody EmergencyContact contact) {
        if (contact.getName() == null || contact.getPhoneNumber() == null) {
            return ResponseEntity.badRequest().body(null);
        }

        EmergencyContact saved = repository.save(contact);
        return ResponseEntity.ok(saved);
    }

    // DELETE → Remove a contact by ID
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteContact(@PathVariable Long id) {
        if (!repository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }

        repository.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
