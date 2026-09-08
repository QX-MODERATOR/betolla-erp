package com.betolla.erp.ui.sales

import android.app.Dialog
import android.content.Context
import android.os.Bundle
import android.view.ViewGroup
import android.widget.Toast
import com.betolla.erp.R
import com.betolla.erp.data.model.Lead
import com.betolla.erp.data.storage.LeadRepository
import com.betolla.erp.databinding.DialogAddLeadBinding
import java.util.UUID

class AddLeadDialog(
    context: Context,
    private val onLeadAdded: () -> Unit
) : Dialog(context) {

    private lateinit var binding: DialogAddLeadBinding
    private val leadRepository = LeadRepository(context)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = DialogAddLeadBinding.inflate(layoutInflater)
        setContentView(binding.root)

        window?.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)

        binding.btnCancelLead.setOnClickListener { dismiss() }

        binding.btnAddLeadConfirm.setOnClickListener {
            val name = binding.etNewLeadName.text?.toString()?.trim().orEmpty()
            val phone = binding.etNewLeadPhone.text?.toString()?.trim().orEmpty()
            val city = binding.etNewLeadCity.text?.toString()?.trim().orEmpty()

            if (name.isEmpty() || phone.isEmpty()) {
                Toast.makeText(context, "يرجى كتابة الاسم ورقم الهاتف", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val newLead = Lead(
                id = "lead-${UUID.randomUUID().toString().substring(0, 5)}",
                name = name,
                phone = phone,
                city = if (city.isNotEmpty()) city else "عمان",
                address = "ليد جديد مضاف يدوياً",
                scheduledTime = "الآن",
                lastCall = "جديد",
                totalCalls = 0,
                notes = "تمت الإضافة من تطبيق المبيعات"
            )

            leadRepository.addLead(newLead)
            Toast.makeText(context, context.getString(R.string.lead_added_success), Toast.LENGTH_SHORT).show()
            onLeadAdded()
            dismiss()
        }
    }
}