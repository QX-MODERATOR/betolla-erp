package com.betolla.erp.ui.sales

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.betolla.erp.data.model.Lead
import com.betolla.erp.databinding.ItemLeadCardBinding

class LeadAdapter(
    private var leads: MutableList<Lead>,
    private val onCallClicked: (Lead) -> Unit,
    private val onWhatsappClicked: (Lead) -> Unit,
    private val onNotesClicked: (Lead) -> Unit,
    private val onOrderClicked: (Lead) -> Unit
) : RecyclerView.Adapter<LeadAdapter.LeadViewHolder>() {

    class LeadViewHolder(val binding: ItemLeadCardBinding) : RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): LeadViewHolder {
        val binding = ItemLeadCardBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return LeadViewHolder(binding)
    }

    override fun onBindViewHolder(holder: LeadViewHolder, position: Int) {
        val lead = leads[position]
        val b = holder.binding

        b.tvCustomerName.text = lead.name
        b.tvScheduledBadge.text = lead.scheduledTime
        b.tvCustomerPhone.text = lead.phone
        b.tvCustomerCity.text = lead.city
        b.tvCustomerAddress.text = lead.address

        if (lead.notes.isNotEmpty()) {
            b.layoutNotesBox.visibility = View.VISIBLE
            b.tvCustomerNotes.text = lead.notes
        } else {
            b.layoutNotesBox.visibility = View.GONE
        }

        b.btnCall.setOnClickListener { onCallClicked(lead) }
        b.btnWhatsapp.setOnClickListener { onWhatsappClicked(lead) }
        b.btnRecordNote.setOnClickListener { onNotesClicked(lead) }
        b.btnCreateOrder.setOnClickListener { onOrderClicked(lead) }
    }

    override fun getItemCount(): Int = leads.size

    fun updateLeads(newLeads: List<Lead>) {
        leads = newLeads.toMutableList()
        notifyDataSetChanged()
    }
}