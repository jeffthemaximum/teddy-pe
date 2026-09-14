module Legacy
  # Named TestResultRow rather than TestResult so it can never be confused
  # with the Rails model of the same name at a glance in a migrator.
  class TestResultRow < Record
    self.table_name = "test_result"
    self.inheritance_column = nil

    def self.table_present? = connection.table_exists?("test_result")
  end
end
