class ProgressionPolicy < ApplicationPolicy
  def show? = read_program?
end
