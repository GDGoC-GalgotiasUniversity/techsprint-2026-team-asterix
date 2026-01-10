package com.safety.sos_backend.repo;

import com.safety.sos_backend.entity.SosAlert;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SosAlertRepository extends JpaRepository<SosAlert, Long> {
}
