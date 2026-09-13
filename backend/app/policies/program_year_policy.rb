# The program itself is readable by everyone signed in, including a viewer.
# Journals and results narrow that in their own policies.
class ProgramYearPolicy < ApplicationPolicy
  def index? = read_program?
  def show?  = read_program?

  class Scope < Scope
    def resolve = user ? scope.all : scope.none
  end
end
