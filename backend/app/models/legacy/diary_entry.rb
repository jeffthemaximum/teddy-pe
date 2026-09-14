module Legacy
  class DiaryEntry < Record
    self.table_name = "diary_entry"
    self.inheritance_column = nil

    def self.table_present? = connection.table_exists?("diary_entry")
  end
end
