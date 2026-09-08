package com.betolla.erp.ui.sales

import android.content.Intent
import android.os.Bundle
import android.provider.CalendarContract
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import com.betolla.erp.R
import com.betolla.erp.data.model.Lead
import com.betolla.erp.data.storage.LeadRepository
import com.betolla.erp.databinding.BottomSheetRecordCallBinding
import com.google.android.material.bottomsheet.BottomSheetDialogFragment

class RecordCallBottomSheet(
    private val lead: Lead,
    private val onNotesUpdated: () -> Unit
) : BottomSheetDialogFragment() {

    private var _binding: BottomSheetRecordCallBinding? = null
    private val binding get() = _binding!!
    private lateinit var leadRepository: LeadRepository

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = BottomSheetRecordCallBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        leadRepository = LeadRepository(requireContext())

        binding.tvSheetCustomerName.text = lead.name
        binding.tvSheetCustomerPhone.text = lead.phone
        binding.etCallNotes.setText(lead.notes)
        binding.etNextCallDate.setText(if (lead.nextCallDate.isNotEmpty()) lead.nextCallDate else "غداً 11:00 AM")

        binding.btnSaveNotes.setOnClickListener {
            val notes = binding.etCallNotes.text?.toString().orEmpty()
            val nextDate = binding.etNextCallDate.text?.toString().orEmpty()

            leadRepository.updateLeadNotes(lead.id, notes, nextDate)
            Toast.makeText(requireContext(), getString(R.string.notes_saved_success), Toast.LENGTH_SHORT).show()
            onNotesUpdated()
            dismiss()
        }

        binding.btnAddToCalendar.setOnClickListener {
            val notes = binding.etCallNotes.text?.toString().orEmpty()
            val intent = Intent(Intent.ACTION_INSERT).apply {
                data = CalendarContract.Events.CONTENT_URI
                putExtra(CalendarContract.Events.TITLE, "متابعة عميل بيفولا: ${lead.name}")
                putExtra(CalendarContract.Events.DESCRIPTION, "الهاتف: ${lead.phone}\nملاحظات: $notes")
                putExtra(CalendarContract.Events.EVENT_LOCATION, lead.city)
            }
            try {
                startActivity(intent)
            } catch (e: Exception) {
                Toast.makeText(requireContext(), "تطبيق التقويم غير متاح", Toast.LENGTH_SHORT).show()
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}